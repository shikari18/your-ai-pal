import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return new Response("Missing GROQ_API_KEY", { status: 500 });
        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof Blob)) return new Response("file required", { status: 400 });

        const out = new FormData();
        out.append("file", file, (file as File).name || "voice.webm");
        out.append("model", "whisper-large-v3");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: out,
        });
        if (!res.ok) {
          const t = await res.text();
          return new Response(t, { status: res.status });
        }
        const j = await res.json();
        return new Response(JSON.stringify({ text: (j as any).text ?? "" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
