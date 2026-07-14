import Anthropic from "@anthropic-ai/sdk";

// Netlify ücretsiz planı senkron fonksiyonları ~10 sn'de keser. O yüzden:
// - hızlı model (haiku) varsayılan
// - yapısal çıktı yok (ilk çağrıdaki şema derleme gecikmesini önler)
// - küçük çıktı + düşük max_tokens
// İstersen Netlify env'inden TRAVEL_MODEL ile modeli değiştirebilirsin.
const MODEL = process.env.TRAVEL_MODEL || "claude-haiku-4-5";

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

function buildPrompt(city, days) {
  const dayLine = days
    ? `The traveler will stay ${days} day(s); shape the scenarios accordingly.`
    : `Make each scenario a full one-day trip.`;
  return `You are an experienced local travel guide. City: "${city}". ${dayLine}

Create 4 DISTINCT themed trip scenarios for this city; each scenario has exactly 5 real, well-known places. Themes should be clearly different (e.g. classic/sightseeing, food, nature/parks, art/museums).

Return ONLY valid JSON in the format below. Do NOT write any explanation, markdown, or code fences. All text in English, descriptions short (max ~8 words). Coordinates must match each place's REAL location.

{
  "city": "city name",
  "country": "country name",
  "scenarios": [
    {
      "title": "short title",
      "theme": "theme",
      "summary": "one-sentence summary",
      "places": [
        { "name": "place name", "category": "museum/park/restaurant etc", "description": "short description", "lat": 0.0, "lng": 0.0, "duration_min": 60 }
      ]
    }
  ]
}`;
}

// Model bazen kod bloğu/önsöz ekleyebilir; ilk { ile son } arasını al.
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Yanıt içinde JSON bulunamadı.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Yalnızca POST destekleniyor." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: "Sunucuda ANTHROPIC_API_KEY tanımlı değil." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const city = (body.city || "").toString().trim();
    const days = body.days ? parseInt(body.days, 10) : null;
    if (!city) return json(400, { error: "Şehir adı gerekli." });

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: buildPrompt(city, days) }],
    });

    if (response.stop_reason === "refusal") {
      return json(422, { error: "İstek modelce reddedildi." });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return json(502, { error: "Modelden metin yanıtı alınamadı." });

    return json(200, extractJson(textBlock.text));
  } catch (err) {
    console.error(err);
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return json(status, { error: err?.message || "Beklenmeyen bir hata oluştu." });
  }
};
