import { createServerFn } from "@tanstack/react-start";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const SYSTEM_PROMPT = `You are Ama, a warm, knowledgeable AI fish farming assistant built into FishFarm OS Ghana. You help Ghanaian fish farmers with feeding, disease diagnosis, water quality, market timing, harvesting, weather impacts, and loans.
Rules:
- Always respond in simple, clear language a rural farmer understands
- If the farmer's selected language is Twi, respond in Twi
- Be warm, encouraging, and practical — like a trusted friend
- Keep responses to 2-4 sentences unless detail is needed
- For feeding advice: always give exact quantities in bags or kg
- For disease: suggest a local/cheap remedy before medicine
- For market: give specific advice based on current price trends
- For weather: translate weather data into direct farm actions
- Never use technical jargon
- Always end with one actionable next step
- Reference the farmer's actual data when available (pond count, fish count, harvest date, location)`;

async function groqChat(body: Record<string, unknown>) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

type Msg = { role: "user" | "assistant"; content: string };

export const askAma = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { messages: Msg[]; language?: string; farmContext?: string };
    if (!Array.isArray(x?.messages)) throw new Error("messages required");
    return { messages: x.messages.slice(-20), language: x.language ?? "English", farmContext: x.farmContext ?? "" };
  })
  .handler(async ({ data }) => {
    const sys = `${SYSTEM_PROMPT}\nFarmer language: ${data.language}.\nFarmer context: ${data.farmContext || "unknown"}.`;
    const reply = await groqChat({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: sys }, ...data.messages],
      max_tokens: 500,
      temperature: 0.7,
    });
    return { reply };
  });

export const analyzePondImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { imageBase64: string };
    if (!x?.imageBase64) throw new Error("imageBase64 required");
    return x;
  })
  .handler(async ({ data }) => {
    const reply = await groqChat({
      model: VISION_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an expert aquaculture consultant in Ghana. Analyse this pond photo. In 2 warm, simple sentences describe: (1) the pond type (earthen, concrete or cage), (2) one observation about visible water quality or conditions. Encourage the farmer.",
            },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
    });
    return { analysis: reply };
  });

export const analyzeFishImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { imageBase64: string };
    if (!x?.imageBase64) throw new Error("imageBase64 required");
    return x;
  })
  .handler(async ({ data }) => {
    const reply = await groqChat({
      model: VISION_MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert aquaculture veterinarian in Ghana. Analyse this fish or pond image. Reply in clean readable text a farmer understands, using these labelled sections exactly:
DISEASE: (most likely disease or water-quality issue, 4-7 words)
SYMPTOMS: three short bullets of visual signs
TREATMENT: locally available treatment in Ghana with dosage
FEEDING: feeding adjustment needed
URGENCY: LOW or MEDIUM or HIGH
No medical jargon.`,
            },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
    });
    return { diagnosis: reply };
  });

export const generateBriefing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { name: string; fishCount: number; fishType: string; farmName: string; region: string; weather: string; timeOfDay: string })
  .handler(async ({ data }) => {
    const prompt = `Generate a 2-3 sentence morning briefing for a Ghanaian fish farmer named ${data.name} who has ${data.fishCount} ${data.fishType} at ${data.farmName} in ${data.region}. Current weather: ${data.weather}. Time: ${data.timeOfDay}. Include: feeding advice with exact bag count, one weather-related farm action, one market observation. Be direct and specific. No greetings.`;
    const reply = await groqChat({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
      max_tokens: 220,
      temperature: 0.7,
    });
    return { briefing: reply };
  });

function safeJSON<T>(s: string, fb: T): T {
  try {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? (JSON.parse(m[0]) as T) : fb;
  } catch {
    return fb;
  }
}

export const generateMarketPrices = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async () => {
    const txt = await groqChat({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output ONLY valid JSON. No markdown." },
        {
          role: "user",
          content: `Generate realistic current fish market prices in Ghana for June 2026. JSON shape:
{"tilapia_live":{"accra":n,"kumasi":n,"tamale":n,"trend":"up|down|flat","change_pct":n},
 "tilapia_smoked":{...},"catfish_live":{...},"catfish_smoked":{...},
 "insight":"one sentence market timing advice for a farmer"}
Prices in GHS per kg. Realistic for Ghana 2026.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.6,
    });
    return safeJSON(txt, {} as Record<string, any>);
  });

export const generateWeatherAlerts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { weatherSummary: string })
  .handler(async ({ data }) => {
    const txt = await groqChat({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output ONLY valid JSON." },
        {
          role: "user",
          content: `Given this weather forecast for a fish farm in Ghana: ${data.weatherSummary}. Generate 2-4 specific alerts. Return JSON {"alerts":[{"urgency":"HIGH|MEDIUM|LOW","title":"5 words max","description":"1 sentence specific action"}]}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.6,
    });
    const j = safeJSON<{ alerts?: any[] }>(txt, { alerts: [] });
    return { alerts: j.alerts ?? [] };
  });

export const generateBuyers = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async () => {
    const txt = await groqChat({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output ONLY valid JSON." },
        {
          role: "user",
          content: `Generate 3 realistic buyer requests for fish in Ghana. JSON {"buyers":[{"buyer_name":"","location":"","quantity_kg":n,"fish_type":"Tilapia|Catfish","price_per_kg":n,"urgent":bool}]} with realistic Ghanaian names and places.`,
        },
      ],
      max_tokens: 400,
      temperature: 0.8,
    });
    const j = safeJSON<{ buyers?: any[] }>(txt, { buyers: [] });
    return { buyers: j.buyers ?? [] };
  });
