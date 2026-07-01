import { createServerFn } from "@tanstack/react-start";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const SYSTEM_PROMPT = `You are Fish Doctor, a friendly AI companion for Ghanaian fish farmers built into Fish Doctor Ghana.

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

STRICT PROMPT FOLLOWING:
- Always answer exactly what the user asked. If they ask "what is the name of this fish?", give the fish name first and foremost — do not default to a disease or health analysis unless asked
- If an image is provided AND the user asks a specific question about it, answer THAT question directly using the image
- Do not redirect or reframe the user's question — answer what was asked
- If the user asks for a name, give the name. If they ask for a disease, give the disease. Match your answer to the intent

FORMATTING RULES (CRITICAL — always follow these):
- Use ## for section headings (these will render as styled headers)
- Use **word** for bold/important text
- Use *word* for emphasis
- Use - item for bullet lists
- Use 1. item for numbered lists
- Never output raw ## or ** in plain text — these are formatting markers and will be rendered visually
- Keep responses well-structured and easy to scan

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
      max_tokens: 300,
      temperature: 0.7,
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
    const x = d as { imageBase64: string; userQuestion?: string };
    if (!x?.imageBase64) throw new Error("imageBase64 required");
    return { imageBase64: x.imageBase64, userQuestion: x.userQuestion ?? "" };
  })
  .handler(async ({ data }) => {
    // Determine intent: identification vs health diagnosis
    const q = data.userQuestion.toLowerCase();
    const isIdentification =
      q.includes("name") || q.includes("what is") || q.includes("what fish") ||
      q.includes("which fish") || q.includes("identify") || q.includes("type of fish") ||
      q.includes("kind of fish") || q.includes("species") || (!q && false);

    const identifyPrompt = `You are an expert fish biologist and aquaculture specialist. The user wants to know what kind of fish is in this image.

Your task:
1. Identify the fish species accurately by examining the image
2. Give the common name AND scientific name
3. Mention if it is found in Ghana or West Africa
4. Give 2-3 interesting facts about this fish

Format your response using these sections:
## Fish Identified
**Common Name:** [name]
**Scientific Name:** [name]
**Found in Ghana:** Yes/No/Common

## About This Fish
- [fact 1]
- [fact 2]
- [fact 3]

Be confident and specific. Do NOT default to a health diagnosis — the user wants identification.`;

    const diagnosisPrompt = `You are an expert aquaculture veterinarian in Ghana. Analyse this fish or pond image and provide a health/disease assessment.

## Disease
[most likely disease or water-quality issue]

## Symptoms
- [visual sign 1]
- [visual sign 2]
- [visual sign 3]

## Treatment
[locally available treatment in Ghana with dosage]

## Feeding Adjustment
[any feeding change needed]

## Urgency
**LOW / MEDIUM / HIGH**

No medical jargon. Use plain language a farmer understands.`;

    const userPromptText = isIdentification ? identifyPrompt : (data.userQuestion ? `The user asked: "${data.userQuestion}"\n\nAnswer their specific question using the image. ${diagnosisPrompt}` : diagnosisPrompt);

    const reply = await groqChat({
      model: VISION_MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPromptText },
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
    const prompt = `You are Fish Doctor, a friendly AI companion for a Ghanaian fish farmer. Write a short, warm, friendly reminder for ${data.name} who has ${data.fishCount} ${data.fishType} at ${data.farmName} in ${data.region}. Current weather: ${data.weather}. Time: ${data.timeOfDay}. Write 1-2 sentences max — a gentle nudge about the single most important thing to do right now. Be warm and friendly like a helpful friend. IMPORTANT: Output plain text only — no JSON, no action blocks, no brackets, nothing but the reminder text.`;
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
