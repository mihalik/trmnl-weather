# trmnl-weather

Minimal, 1‑bit friendly 5‑day forecast for the TRMNL display (800×480). Pure HTML/CSS/JS with inline SVG icons and no runtime dependencies.

## Screenshot

![TRMNL Weather example](docs/screenshot.png)

**What it does**
- Renders a header with current temperature/conditions and last‑updated time
- Shows 5 days with icon, high/low, precip %, and wind
- Draws per‑day temperature range bars along the bottom
- Uses black/white only for crisp e‑paper screenshots

## Quick Start

Paste the html/javascript into the TRMNL console, fetch the JSON via API.

TRMNL injects data via Liquid variables. Drop `index.html` into your TRMNL app and map your data to the following Liquid values:
- `{{current|json}}`
- `{{forecast|json}}` (expects NOAA‑style `periods` with `isDaytime`)
- `{{location|json}}`

No external fonts or libraries are required.

## Data Shape

The renderer is flexible, but the simplest input is NOAA/NWS style:
- `current.timestamp`, `current.temperature.value`, `current.description`
- `forecast.periods[]` with `isDaytime`, `startTime`, `temperature`, optional `probabilityOfPrecipitation.value`, `windSpeed`, `windDirection`, `shortForecast`

`normalizeForecast(...)` also accepts alternative keys commonly returned by other APIs (e.g., `daily[]` with `high/low/pop/wind*`).

## Notes

- Designed for 800×480; fonts and line weights are tuned for readability from a distance.
- Icons are inline SVG; strokes use `vector-effect: non-scaling-stroke` for crisp rendering.
- Everything is self‑contained to simplify TRMNL deployment and screenshots.

## Fun view (`fun.html`)

An alternate, self-contained view using the same Liquid data. The left half is an American Gothic style 1-bit line drawing of the two of us in front of a farmhouse, dressed for today's forecast period (tonight's after dark):

- Clothing by temperature: tank tops (90°+), t-shirts (72°+), long sleeves (45°+), coats and hats below that (scarves below 32°). On about 1 in 10 sunny tank-top days (rolled once per day) it's a bikini top and shirtless instead. Occasionally his tee/tank gets a print or chest pocket (Keep Austin Weird, Apple logo, Texas with a star on Austin, Y'ALL, or pocket) and her top gets a pattern (stripes, stars, polka dots, or a floral sprig). On 100°F+ sunny days, heat shimmer rises off the roof with sweat drops.
- Sky & landscape by forecast and season: sun + sunglasses, clouds, rain + umbrella, forked lightning, snow (with drifted ground and snow-capped eaves), layered fog banks, leafy wind gusts; seasonal trees and lawn (spring blossoms, summer foliage, falling autumn leaves, bare winter branches); black starry sky at night with the true moon phase (Meeus algorithm, accurate to minutes) and a big glowing moon on the night of the full moon
- Easter eggs (about 1 hour in 4, stable within the hour; rarer for sillier/house-swap ones): owl on the roof, airplane, hot air balloon, geese, shooting star, UFO, kite, rainbow, snowman, cat in the window, a bird on his head, a deer, a rabbit, a formation of Black Hawk helicopters, a Holstein cow, cowboy hats, a nocturnal armadillo, and (extra rare) the house swapped for a castle or the Alamo. Yard animals stand in the grass and can face either direction.
- Holidays and seasons:
  - US flag on a yard pole for Presidents Day, Memorial Day (half-staff until noon), Flag Day, July 3–4, Labor Day, Patriot Day (half-staff), and Veterans Day
  - Groundhog Day: a groundhog by the door, casting a shadow if it's sunny
  - Valentine's Day hearts; St. Patrick's Day shamrocks and a leprechaun hat; Easter eggs in the grass with the bunny
  - Pumpkin in late October; on Halloween it's carved, with bats, a ghost in the window, and a witch hat
  - Thanksgiving turkey; wreath in December; roof lights Dec 1–Jan 1; Santa hats Dec 24–25
  - Party hats on Feb 17 and Jul 13; fireworks on July 4 and New Year's

The right half shows:

- The current temperature from the latest observation (falling back to the forecast period's), with a thermometer icon
- Beside it, the precipitation chance for the current period (the drop icon fills to match) and the expected total ("70% · 0.62 in", or "Dry"): rain, snow, or ice in inches from the API's per-period `precipitation` field, falling back to amounts NWS mentions in the detailed forecast ("rainfall amounts between a quarter and half of an inch") when that field is missing
- Below that, today's sunset by day or the next sunrise at night, calculated from `location.latitude`/`longitude`
- A 6-day trend chart starting today: day names (today's in a black pill), weather icons, rain chances of 20%+, and highs (thick line) and lows (dashed line) on one scale, so warming and cooling trends read from across the room
- **Heads Up**: up to 2 one-line highlights from rules over the next 6 days: severe storms, storms, snow/ice, rain, freezes, big temperature swings (15°+), wind (25 mph or gusts 35+), fog (patchy, areas of, or dense, with timing like "before 9am"), and heat (100° or heat index 108+). Each rule picks its most significant period; the top 2 by importance (nearer days win ties) are shown in time order. Rain items include the expected amount ("Heavy rain" at 1 inch+ in one period). Active NWS alerts from the API's `alerts` field (marked with a black warning triangle) rank above the rules by severity, e.g. "Flood Watch until tomorrow 6pm" or "Freeze Warning Sunday night, low of 29°"; an alert replaces a rule item of the same kind for the same period and keeps its numbers. Quiet weeks get a single "Dry and quiet through ..." line. Thresholds are constants at the top of the highlights code. Both `alerts` and `precipitation` are optional, so the view still works with data that lacks them.

## Previewing the scene and full display

`scripts/preview-scene.js` renders either the left-hand scene (SVG contact sheet) or the full 800×480 display (`--full`, both scene and right-hand panel) offline for any date, weather, alert, easter egg, or outfit, writing `/tmp/fun-preview/sheet.png` on macOS:

```sh
node scripts/preview-scene.js --eggs                 # every easter egg (scene only)
node scripts/preview-scene.js --holidays             # every holiday this year (scene only)
node scripts/preview-scene.js --full --states        # 6 full 800×480 scenarios + contact sheet
node scripts/preview-scene.js --full                 # default 800×480 render from example-weather.json
node scripts/preview-scene.js hot='{"period":{"temperature":98},"look":{"swim":true}}'
node scripts/preview-scene.js --crop 150,150,250,140 xmas='{"now":"2026-12-25T14:00:00-06:00"}'
```

See the comment at the top of the script for all options.

## Deploying

`scripts/push-trmnl.py` uploads a markup file to the hosted plugin through TRMNL's MCP endpoint. It reads the plugin's MCP URL (including the `api_key`) from `.mcp.json`, which is gitignored:

```sh
python3 scripts/push-trmnl.py              # fun.html -> markup_shared + markup_full
python3 scripts/push-trmnl.py index.html   # no marker: whole file -> markup_full, shared cleared
```

The endpoint rejects requests over about 64 KB, so:

- `fun.html` is split at its `<!-- trmnl:split -->` line. Everything above it (core scene-drawing + weather helpers, exposed on `window.FunWeather`) goes to `markup_shared`, which TRMNL prepends to every layout. Everything below it (`<script id="scene-extras">` for easter-egg/holiday/alternate-house art, styles, `<main>`, and the panel script) goes to `markup_full`. Each slot has its own ~64 KB budget. Code below the marker that needs a shared helper takes it from `window.FunWeather`. Add a name to the shared script's `return { ... }` (or `svg`) and to the destructuring line below.
- Indentation, blank lines, and full-line `//` comments are stripped before uploading. Rendering is unchanged, but the hosted copy won't match the local file byte for byte.

The script checks sizes before uploading anything. If a slot is still too large, move the marker or paste into the TRMNL web editor instead.

## License

MIT — see `LICENSE`.
