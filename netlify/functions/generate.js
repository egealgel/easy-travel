import Anthropic from "@anthropic-ai/sdk";

// Model, Netlify ortam değişkeninden değiştirilebilir (kod değişmeden).
// Not: Netlify ücretsiz planında senkron fonksiyonlar ~10 sn'de kesilir.
// Zaman aşımı yaşarsan Netlify'da TRAVEL_MODEL=claude-haiku-4-5 yap (daha hızlı & ucuz).
const MODEL = process.env.TRAVEL_MODEL || "claude-opus-4-8";

// İstemciyi tembel kur: anahtar yoksa modül yüklenirken patlamasın,
// handler içinde net bir hata dönebilelim.
let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SCHEMA = {
  type: "object",
  properties: {
    city: { type: "string" },
    country: { type: "string" },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Kısa, çekici senaryo başlığı" },
          theme: { type: "string", description: "Örn: Klasik & Turistik, Yeme-İçme, Doğa, Sanat, Gece" },
          summary: { type: "string", description: "Senaryonun bir cümlelik özeti" },
          places: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string", description: "Örn: müze, park, restoran, meydan, cami" },
                description: { type: "string", description: "Neden gidilmeli, tek cümle" },
                lat: { type: "number", description: "Enlem (WGS84)" },
                lng: { type: "number", description: "Boylam (WGS84)" },
                duration_min: { type: "integer", description: "Tahmini gezme süresi (dakika)" },
              },
              required: ["name", "category", "description", "lat", "lng", "duration_min"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "theme", "summary", "places"],
        additionalProperties: false,
      },
    },
  },
  required: ["city", "country", "scenarios"],
  additionalProperties: false,
};

function buildPrompt(city, days) {
  const dayLine = days
    ? `Gezgin ${days} gün kalacak; senaryoları buna uygun kur ve gerekiyorsa günlere böl.`
    : `Gün sayısı belirtilmedi; her senaryoyu tek günlük dolu bir gezi gibi kur.`;
  return `Sen deneyimli bir yerel seyahat rehberisin. Şehir: "${city}".

${dayLine}

Görev: Bu şehir için 4-5 FARKLI temalı gezi senaryosu üret. Her senaryoda 5-8 gerçek, ünlü ve gerçekten var olan gezilecek yer olsun. Temalar birbirinden belirgin şekilde ayrışsın (örn: klasik/turistik, yeme-içme & yerel yaşam, doğa/park/manzara, sanat & müze, alışveriş/gece hayatı).

Kurallar:
- Sadece GERÇEK, tanınmış mekanlar kullan. Yer uydurma.
- Her yer için DOĞRU enlem/boylam (lat/lng) ver. Koordinatlar mekânın gerçek konumuyla eşleşmeli.
- Her senaryodaki yerler coğrafi olarak makul bir günde gezilebilecek yakınlıkta olsun.
- Açıklamalar Türkçe, kısa ve net olsun.
- Şehrin bulunduğu ülkeyi de belirt.`;
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
      max_tokens: 8000,
      messages: [{ role: "user", content: buildPrompt(city, days) }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    if (response.stop_reason === "refusal") {
      return json(422, { error: "İstek modelce reddedildi." });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return json(502, { error: "Modelden metin yanıtı alınamadı." });

    return json(200, JSON.parse(textBlock.text));
  } catch (err) {
    console.error(err);
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return json(status, { error: err?.message || "Beklenmeyen bir hata oluştu." });
  }
};
