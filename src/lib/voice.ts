export function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GH";
  u.rate = 0.92;
  u.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export async function speakTwi(text: string) {
  const key = typeof window !== "undefined" ? localStorage.getItem("khayaApiKey") : null;
  if (!key) {
    speakEnglish(text);
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
    speakEnglish(text);
  }
}

export function speak(text: string) {
  const twi = typeof window !== "undefined" && localStorage.getItem("twiVoice") === "true";
  if (twi) void speakTwi(text);
  else speakEnglish(text);
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
