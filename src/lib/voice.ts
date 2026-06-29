// Gemini TTS key is read from the environment (set VITE_GEMINI_TTS_KEY in your .env or Render env vars)
// Vite exposes VITE_* vars to the client at build time
const GEMINI_TTS_KEY = typeof import.meta !== "undefined"
  ? (import.meta as { env?: { VITE_GEMINI_TTS_KEY?: string } }).env?.VITE_GEMINI_TTS_KEY ?? ""
  : "";

export async function speakGemini(text: string): Promise<void> {
  try {
    // Gemini Live TTS via REST (text-to-speech synthesis)
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_TTS_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "en-GH",
            name: "en-GB-Journey-F",
            ssmlGender: "FEMALE",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 0.95,
            pitch: 0,
          },
        }),
      }
    );
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) throw new Error("No audio content");
    const audio = new Audio(`data:audio/mp3;base64,${j.audioContent}`);
    return new Promise((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => { speakEnglish(text); resolve(); };
      audio.play().catch(() => { speakEnglish(text); resolve(); });
    });
  } catch {
    // fallback to browser TTS
    return speakEnglishAsync(text);
  }
}

export function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GH";
  u.rate = 0.92;
  u.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function speakEnglishAsync(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GH";
    u.rate = 0.92;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export async function speakTwi(text: string) {
  const key = typeof window !== "undefined" ? localStorage.getItem("khayaApiKey") : null;
  if (!key) {
    await speakGemini(text);
    return;
  }
  try {
    const res = await fetch("https://translation-api.ghananlp.org/tts/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": key },
      body: JSON.stringify({ text, language: "tw" }),
    });
    if (!res.ok) throw new Error("twi tts fail");
    const blob = await res.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
  } catch {
    await speakGemini(text);
  }
}

export function speak(text: string) {
  const twi = typeof window !== "undefined" && localStorage.getItem("twiVoice") === "true";
  if (twi) void speakTwi(text);
  else void speakGemini(text);
}

export async function recordAndTranscribe(): Promise<{ stop: () => Promise<string> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        rec.onstop = async () => {
          try {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(chunks, { type: mime });
            const ext = mime.includes("webm") ? "webm" : "mp4";
            const fd = new FormData();
            fd.append("file", blob, `voice.${ext}`);
            const res = await fetch("/api/public/transcribe", { method: "POST", body: fd });
            if (!res.ok) throw new Error("stt failed");
            const j = (await res.json()) as { text: string };
            resolve(j.text || "");
          } catch (e) {
            reject(e);
          }
        };
        rec.stop();
      }),
  };
}
