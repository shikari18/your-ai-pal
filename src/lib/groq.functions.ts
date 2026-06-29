import { createServerFn } from "@tanstack/react-start";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const SYSTEM_PROMPT = `You are Ama, a friendly AI companion for Ghanaian fish farmers built into FishFarm OS Ghana.

PERSONALITY:
- You are warm, conversational, and feel like a trusted friend the farmer can talk to anytime
- Start conversations naturally — say hi, ask how they're doing, check in on their day
- Be genuinely interested in the farmer as a person, not just their fish
- Use casual, friendly language. Laugh, joke a little, be human
- Don't always bring things back to fish — if they want to chat about life, chat about life
- When they do need fish help, switch to expert mode naturally

FISH EXPERTISE (when needed):
- Give exact feeding quantities in bags or kg
- For disease: suggest local/cheap Ghanaian remedy first before medicine
- For market: give specific advice based on current price trends
- For weather: translate weather data into direct farm actions
- Reference the farmer's actual data when available

LANGUAGE:
- Respond in the farmer's selected language (Twi if set)
- Keep language simple and clear for rural farmers
- Use warm, encouraging tone

FARM ACTIONS:
- If the farmer tells you something changed about their farm (fish died, sold fish, added fish, added a pond, etc.), you MUST respond with a JSON action block so the app can update automatically
- Format: [[ACTION:{"type":"update_farm","data":{...}}]]
- For fish count changes use: {"type":"update_farm","data":{"fishCount": NUMBER}}
- For pond count: {"type":"update_farm","data":{"pondCount": NUMBER}}
- For fish type: {"type":"update_farm","data":{"fishType": "TYPE"}}
- ALWAYS include the action AND a warm conversational response
- Example: if user says "one of my fish died" → reply warmly about it AND include [[ACTION:{"type":"update_farm","data":{"fishCount": CURRENT_MINUS_1}}]]

REMINDERS (occasional, not every message):
- Sometimes gently remind about feeding if it's been a while
- Mention harvest timing when it's getting close
- Check in on pond health occasionally

Be the kind of friend every farmer wishes they had — helpful when needed, good company always.`;

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
  .validator((d: unknown) => {
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
      temperature: 0.8,
    });
    // Return the full reply (including action blocks) so the client can parse them,
    // but also return a clean version for display
    const displayReply = reply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, "").trim();
    return { reply, displayReply };
  });

export const analyzePondImage = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const x = d as { imageBase64: string };
    if (!x?.imageBase64) throw new Error("imageBase64 required");
    return x;
  })
  .handler(async ({ data }) => {
    const reply = await groqChat({
      model: VISION_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an expert aquaculture consultant in Ghana. Analyse this pond photo. Write 2 warm, friendly sentences for the farmer: (1) what type of pond it appears to be, (2) one encouraging observation about their pond. Keep it simple, positive and plain text only — no bullet points, no labels, no technical jargon.",
            },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
    });
    const clean = reply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, "").trim();
    return { analysis: clean };
  });

export const analyzeFishImage = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
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
  .validator((d: unknown) => d as { name: string; fishCount: number; fishType: string; farmName: string; region: string; weather: string; timeOfDay: string })
  .handler(async ({ data }) => {
    const prompt = `You are Ama, a friendly AI companion for a Ghanaian fish farmer. Write a short, warm, friendly reminder for ${data.name} who has ${data.fishCount} ${data.fishType} at ${data.farmName} in ${data.region}. Current weather: ${data.weather}. Time: ${data.timeOfDay}. Write 1-2 sentences max — a gentle nudge about the single most important thing to do right now. Be warm and friendly like a helpful friend. IMPORTANT: Output plain text only — no JSON, no action blocks, no brackets, nothing but the reminder text.`;
    const reply = await groqChat({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
    });
    // Strip any accidental action blocks before returning
    const clean = reply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, "").trim();
    return { briefing: clean };
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
  .validator(() => ({}))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
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
    return safeJSON(txt, {} as Record<string, unknown>);
  });

export const generateWeatherAlerts = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { weatherSummary: string })
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
    const j = safeJSON<{ alerts?: unknown[] }>(txt, { alerts: [] });
    return { alerts: (j.alerts ?? []) as { urgency: string; title: string; description: string }[] };
  });

export const generateBuyers = createServerFn({ method: "POST" })
  .validator(() => ({}))
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
    const j = safeJSON<{ buyers?: unknown[] }>(txt, { buyers: [] });
    return { buyers: (j.buyers ?? []) as { buyer_name: string; location: string; quantity_kg: number; fish_type: string; price_per_kg: number; urgent: boolean }[] };
  });
