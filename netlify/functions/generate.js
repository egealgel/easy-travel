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
    ? `Gezgin ${days} gün kalacak; senaryoları buna göre kur.`
    : `Her senaryo tek günlük dolu bir gezi olsun.`;
  return `Sen deneyimli bir yerel seyahat rehberisin. Şehir: "${city}". ${dayLine}

Bu şehir için 4 FARKLI temalı gezi senaryosu üret; her senaryoda tam 5 gerçek ve ünlü yer olsun. Temalar ayrışsın (örn: klasik/turistik, yeme-içme, doğa/park, sanat/müze).

SADECE aşağıdaki biçimde geçerli JSON döndür. Açıklama, markdown, kod bloğu YAZMA. Tüm metinler Türkçe, açıklamalar kısa (en fazla ~8 kelime). Koordinatlar mekânın GERÇEK konumuyla eşleşsin.

{
  "city": "şehir",
  "country": "ülke",
  "scenarios": [
    {
      "title": "kısa başlık",
      "theme": "tema",
      "summary": "tek cümle özet",
      "places": [
        { "name": "yer adı", "category": "müze/park/restoran vb", "description": "kısa açıklama", "lat": 0.0, "lng": 0.0, "duration_min": 60 }
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
