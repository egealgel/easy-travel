# easyTravel — AI Travel Scenario Planner

Type a city and the number of days, and AI builds themed day-trip scenarios for
it. Every place is pinned on a map and **numbered 1‑2‑3 in the most efficient
visiting order**, so you can follow the route or export it straight to Google
Maps.

## Features

- **AI-picked places** — for a given city, the model selects real, well-known
  spots grouped into distinct themes (classic/sightseeing, food, nature/parks,
  art/museums…), each with its real coordinates.
- **Route optimization** — places in each scenario are reordered into the
  shortest walking route in the browser using a *nearest-neighbor + 2-opt*
  algorithm.
- **Numbered map** — an interactive Leaflet + OpenStreetMap view with 1, 2, 3…
  pins and the route line drawn between them.
- **Export to Google Maps** — download a **KML** file to import into Google My
  Maps (numbered pins saved to your account), or open the ordered route directly
  as Google Maps directions.

## How it works

```
Browser (HTML / CSS / JS)
   │  sends the city + days
   ▼
Serverless function
   │  calls an LLM → real places with coordinates, grouped by theme
   ▼
Browser: route optimization + interactive map + KML / Google Maps output
```

The API key stays server-side and is never exposed to the browser.

## Tech stack

Vanilla HTML/CSS/JS · Leaflet · OpenStreetMap · Serverless functions · LLM API

---

*A personal portfolio project.*
