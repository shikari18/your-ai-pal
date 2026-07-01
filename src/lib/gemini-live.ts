/**
 * Gemini Live API – bidirectional audio voice call
 * Uses raw WebSocket per https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
 * Voice: Aoede (realistic warm female)
 */

const GEMINI_LIVE_KEY =
  typeof import.meta !== "undefined"
    ? (import.meta as { env?: { VITE_GEMINI_LIVE_KEY?: string } }).env
        ?.VITE_GEMINI_LIVE_KEY ?? ""
    : "";

const MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_LIVE_KEY}`;

export type LiveStatus = "connecting" | "listening" | "thinking" | "speaking" | "error";

export type LiveCallHandlers = {
  onStatusChange: (s: LiveStatus) => void;
  onUserText: (t: string) => void;
  onAssistantText: (t: string) => void;
  onLevel: (l: number) => void;
  onError: (e: string) => void;
};

export class GeminiLiveCall {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private levelBuf: Uint8Array | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  private handlers: LiveCallHandlers;
  private systemPrompt: string;
  private active = false;
  private ready = false; // true after setupComplete received

  // Audio playback queue
  private playbackQueue: Float32Array[] = [];
  private playbackCtx: AudioContext | null = null;
  private nextPlayTime = 0;

  private readonly INPUT_SAMPLE_RATE = 16000;
  private readonly OUTPUT_SAMPLE_RATE = 24000;

  constructor(systemPrompt: string, handlers: LiveCallHandlers) {
    this.systemPrompt = systemPrompt;
    this.handlers = handlers;
  }

  async start() {
    this.active = true;
    this.handlers.onStatusChange("connecting");

    // Separate AudioContext for playback at 24kHz
    this.playbackCtx = new AudioContext({ sampleRate: this.OUTPUT_SAMPLE_RATE });
    this.nextPlayTime = this.playbackCtx.currentTime;

    // Open mic stream first
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      this.handlers.onError("Microphone access denied.");
      this.handlers.onStatusChange("error");
      return;
    }

    // Audio capture context at 16kHz
    this.audioCtx = new AudioContext({ sampleRate: this.INPUT_SAMPLE_RATE });
    const src = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // Level analyser for visualisation ring
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.levelBuf = new Uint8Array(this.analyserNode.fftSize);
    src.connect(this.analyserNode);
    this.levelTimer = setInterval(() => {
      if (!this.analyserNode || !this.levelBuf) return;
      this.analyserNode.getByteTimeDomainData(this.levelBuf);
      let sum = 0;
      for (let i = 0; i < this.levelBuf.length; i++) {
        const v = (this.levelBuf[i] - 128) / 128;
        sum += v * v;
      }
      this.handlers.onLevel(Math.sqrt(sum / this.levelBuf.length));
    }, 80);

    // ScriptProcessor for mic → Gemini streaming
    // Use 4096 buffer to avoid flooding the socket before ready
    const BUFFER = 4096;
    this.scriptProcessor = this.audioCtx.createScriptProcessor(BUFFER, 1, 1);
    src.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioCtx.destination);

    this.scriptProcessor.onaudioprocess = (e) => {
      // CRITICAL: only send audio AFTER setupComplete
      if (!this.active || !this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = float32ToInt16(float32);
      const b64 = arrayBufferToBase64(int16.buffer);
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: b64,
              mimeType: "audio/pcm;rate=16000",
            },
          },
        })
      );
    };

    // Open WebSocket
    this.ws = new WebSocket(WS_URL);

    // Connection timeout — 10 seconds
    this.connectTimer = setTimeout(() => {
      if (!this.ready && this.active) {
        this.handlers.onError("Connection timed out. Please try again.");
        this.handlers.onStatusChange("error");
        this.stop();
      }
    }, 10000);

    this.ws.onopen = () => {
      if (!this.ws) return;
      console.log("[GeminiLive] WebSocket open, sending setup...");
      this.ws.send(
        JSON.stringify({
          setup: {
            model: MODEL,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Aoede" },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: this.systemPrompt }],
            },
          },
        })
      );
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        console.log("[GeminiLive] message:", JSON.stringify(msg).slice(0, 200));
        this.handleMessage(msg);
      } catch (err) {
        console.warn("[GeminiLive] parse error", err);
      }
    };

    this.ws.onerror = (e) => {
      console.error("[GeminiLive] WS error", e);
      this.handlers.onError("Connection error. Check your API key and network.");
      this.handlers.onStatusChange("error");
    };

    this.ws.onclose = (ev) => {
      console.log("[GeminiLive] WS closed", ev.code, ev.reason);
      if (this.active) {
        const reason = ev.reason ? `${ev.code}: ${ev.reason}` : String(ev.code);
        this.handlers.onError(`Connection closed (${reason}).`);
        this.handlers.onStatusChange("error");
      }
      this.cleanupInput();
    };
  }

  private handleMessage(msg: Record<string, unknown>) {
    // setupComplete — now safe to start sending audio
    if (msg.setupComplete !== undefined) {
      console.log("[GeminiLive] setupComplete, ready to listen");
      if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
      this.ready = true;
      this.handlers.onStatusChange("listening");
      return;
    }

    const sc = msg.serverContent as Record<string, unknown> | undefined;
    if (!sc) return;

    // Interrupted: user spoke over the assistant
    if (sc.interrupted) {
      this.playbackQueue = [];
      if (this.playbackCtx) this.nextPlayTime = this.playbackCtx.currentTime;
      this.handlers.onStatusChange("listening");
      return;
    }

    // Input transcription (what the user said)
    const inputTx = sc.inputTranscription as Record<string, unknown> | undefined;
    if (inputTx?.text) {
      this.handlers.onUserText(inputTx.text as string);
    }

    // Output transcription (what Fish Doctor said)
    const outputTx = sc.outputTranscription as Record<string, unknown> | undefined;
    if (outputTx?.text) {
      this.handlers.onAssistantText(outputTx.text as string);
    }

    // Audio chunks from modelTurn
    const modelTurn = sc.modelTurn as Record<string, unknown> | undefined;
    if (modelTurn) {
      const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
      if (parts) {
        for (const part of parts) {
          const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
          if (inline?.data) {
            this.handlers.onStatusChange("speaking");
            this.enqueueAudio(inline.data);
          }
        }
      }
    }

    // Turn complete → back to listening after audio drains
    if (sc.turnComplete) {
      this.onPlaybackDone(() => this.handlers.onStatusChange("listening"));
    }
  }

  private enqueueAudio(b64: string) {
    const buf = base64ToArrayBuffer(b64);
    const int16 = new Int16Array(buf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    this.playbackQueue.push(float32);
    this.drainQueue();
  }

  private drainQueue() {
    if (!this.playbackCtx) return;
    while (this.playbackQueue.length > 0) {
      const samples = this.playbackQueue.shift()!;
      const buffer = this.playbackCtx.createBuffer(1, samples.length, this.OUTPUT_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      const source = this.playbackCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.playbackCtx.destination);
      const startAt = Math.max(this.nextPlayTime, this.playbackCtx.currentTime + 0.005);
      source.start(startAt);
      this.nextPlayTime = startAt + buffer.duration;
    }
  }

  private onPlaybackDone(cb: () => void) {
    if (!this.playbackCtx) { cb(); return; }
    const remaining = this.nextPlayTime - this.playbackCtx.currentTime;
    if (remaining <= 0) { cb(); return; }
    setTimeout(cb, remaining * 1000 + 100);
  }

  stop() {
    this.active = false;
    this.ready = false;
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    if (this.levelTimer) { clearInterval(this.levelTimer); this.levelTimer = null; }
    this.cleanupInput();
    if (this.ws) {
      try { this.ws.close(1000, "user ended call"); } catch {}
      this.ws = null;
    }
    if (this.playbackCtx) {
      try { void this.playbackCtx.close(); } catch {}
      this.playbackCtx = null;
    }
    this.playbackQueue = [];
  }

  private cleanupInput() {
    if (this.scriptProcessor) {
      try { this.scriptProcessor.disconnect(); } catch {}
      this.scriptProcessor = null;
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch {}
      this.analyserNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try { void this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function float32ToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
