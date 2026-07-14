# easyTravel — Yapay Zeka Destekli Gezi Senaryosu Planlayıcı

Bir şehir yaz → yapay zeka (Claude) sana **4-5 temalı gezi senaryosu** çıkarsın →
her senaryodaki yerler **en kısa rotaya göre 1-2-3 diye numaralanıp** haritada
gösterilsin → tek tıkla **Google My Maps'e aktarılabilen bir KML dosyası** indir
veya **Google Maps yön tarifini** aç.


## Ne yapıyor?

- **Yapay zeka ile mekan seçimi:** Claude, şehir için gerçek ve ünlü yerleri temalara göre seçer, koordinatlarıyla birlikte döner.
- **Rota optimizasyonu:** Her senaryodaki yerler tarayıcıda *nearest-neighbor + 2-opt* algoritmasıyla en kısa gezme sırasına dizilir.
- **Numaralı harita:** Leaflet + OpenStreetMap üzerinde 1, 2, 3… numaralı pinler ve rota çizgisi.
- **Google Maps'e aktarım:** KML indir → `google.com/mymaps` → *İçe aktar*; ya da doğrudan Google Maps yön tarifi linki.

## Mimari

```
Tarayıcı (index.html / app.js)
   │  fetch("/api/generate", { city, days })
   ▼
Netlify Function (netlify/functions/generate.js)
   │  Claude API (anahtar sunucuda gizli)  →  yapısal JSON (senaryolar + koordinatlar)
   ▼
Tarayıcı: rota optimizasyonu + Leaflet harita + KML/Google Maps çıktısı
```

API anahtarı **hiçbir zaman tarayıcıya gönderilmez** — Claude çağrısı Netlify fonksiyonunda yapılır, anahtar ortam değişkeninde durur.

## Yerelde çalıştırma

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY değerini doldur
npx netlify dev           # http://localhost:8888
```

> `netlify dev`, `.env` dosyasını otomatik okur ve `/api/generate` yönlendirmesini yerelde de çalıştırır.

## Notlar

- **Ücretsiz Netlify limiti:** Senkron fonksiyonlar ~10 sn'de kesilir. Varsayılan model `claude-opus-4-8` en kaliteli sonucu verir ama bazen yavaş olabilir; zaman aşımı görürsen `TRAVEL_MODEL=claude-haiku-4-5` yeterince hızlıdır.
- **Maliyet:** Yalnızca Claude API çağrıları ücretlidir (şehir başına birkaç sent). Harita (OpenStreetMap) ve barındırma (Netlify ücretsiz plan) bedavadır.
- **Koordinat doğruluğu:** Yerler ve koordinatlar modelden gelir; nadiren küçük sapmalar olabilir.

## Kullanılan teknolojiler

Sade HTML/CSS/JS · Leaflet · OpenStreetMap · Netlify Functions · Claude API
