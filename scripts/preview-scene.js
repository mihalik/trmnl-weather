#!/usr/bin/env node
// Render fun.html offline for chosen dates / weather / easter eggs — either the left-hand
// scene (default, SVG contact sheet) or the full 800x480 screen (--full, WebKit PNGs on macOS).
//
//   node scripts/preview-scene.js [options] [name='{json}' ...]
//
// Each spec is name=JSON with any of:
//   now          ISO time (default 2026-11-20T14:00-06:00, or example-weather.json in --full)
//   night        true for a night period
//   egg          easter egg key (see --eggs), or null
//   period       NWS period overrides, e.g. {"temperature":96,"shortForecast":"Rain"}
//   w            overrides for the analyzed weather, e.g. {"tier":"tank","windy":true}
//   look         outfit overrides passed to drawScene, e.g. {"swim":true,"shirt":"apple"}
//   current      (--full) overrides merged onto example-weather.json's current observation
//   currentTemp  (--full) shorthand for observed temperature in deg F
//   periods      (--full) custom 12-hour forecast tuples [isDay, temp, pop, short, detail?, wind?, precip?]
//                         or full NWS period objects
//   baseTime     (--full) ISO start time for `periods` tuples
//   forecast     (--full) full forecast object override
//   location     (--full) { latitude, longitude } override
//   alerts       (--full) array of NWS alert objects, e.g. [{"event":"Flood Watch","severity":"Moderate",...}]
//
// Options:
//   --full          render full 800x480 fun.html (both scene and right panel)
//   --states        add 6 curated full-screen scenarios (implies --full)
//   --eggs          add one scene per easter egg (night ones at night)
//   --holidays      add one scene per holiday in the current year
//   --file F        markup file (default fun.html)
//   --out DIR       output directory (default /tmp/fun-preview)
//   --cols N        sheet columns (default 4, or 2 in --full mode)
//   --scale N       zoom the scene sheet, e.g. 2 to inspect details (default 1)
//   --crop x,y,w,h  show only that region of each scene, scaled up to fill its cell (scene mode)
//
// Scene mode writes DIR/<name>.svg, DIR/sheet.svg, and (on macOS via qlmanage) DIR/sheet.png.
// Full mode writes DIR/<name>.html, DIR/sheet.html, and (on macOS via native WebKit/JXA)
// exact 800x480 DIR/<name>.png files plus a labeled contact sheet DIR/sheet.png.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 1), true) : false; };

const root = path.resolve(__dirname, '..');
const file = path.resolve(root, opt('--file', 'fun.html'));
const out = path.resolve(opt('--out', '/tmp/fun-preview'));
const wantStates = flag('--states');
const wantFull = flag('--full') || wantStates;
const cols = +opt('--cols', wantFull ? 2 : 4);
const scale = +opt('--scale', 1);
const crop = opt('--crop', null);
const wantEggs = flag('--eggs');
const wantHolidays = flag('--holidays');

const html = fs.readFileSync(file, 'utf8');
const [shared, rest = ''] = html.split('<!-- trmnl:split');
// Load the shared scene script plus optional <script id="scene-extras"> from below the split.
const scripts = [
    ...[...shared.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]),
    ...[...rest.matchAll(/<script\b[^>]*\bid=["']scene-extras["'][^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
].join('\n');
const ctx = { console, Intl, Date, Math, JSON, String, Number, Object, Array, isFinite, parseFloat };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(scripts, ctx);
const FW = ctx.FunWeather;

const specs = args.map(a => {
    const i = a.indexOf('=');
    if (i < 0) throw new Error(`Expected name=JSON, got ${a}`);
    return [a.slice(0, i), JSON.parse(a.slice(i + 1))];
});

if (wantEggs) {
    const nightOnly = new Set(['owl', 'shootingStar', 'ufo', 'armadillo']);
    for (const egg of FW.EGG_NAMES) {
        const o = { egg, night: nightOnly.has(egg) };
        if (egg === 'rainbow') o.period = { shortForecast: 'Showers Likely', probabilityOfPrecipitation: { value: 70 } };
        if (egg === 'snowman') o.period = { temperature: 28, shortForecast: 'Snow' };
        if (egg === 'kite') o.period = { shortForecast: 'Sunny and Breezy', windSpeed: '20 mph' };
        specs.push([egg, o]);
    }
}
if (wantHolidays) {
    const y = new Date().getFullYear(), nth = FW.nthWeekday, [em, ed] = FW.easter(y);
    const at = (m, d, h = 14) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-06:00`;
    const cold = { period: { temperature: 40 } };
    for (const [name, iso, extra] of [
        ['groundhog', at(2, 2), cold], ['valentine', at(2, 14), cold], ['presidents', at(2, nth(y, 2, 1, 3)), cold],
        ['stPatrick', at(3, 17)], ['easter', at(em, ed)], ['memorialAM', at(5, nth(y, 5, 1, -1), 9)],
        ['july4', at(7, 4)], ['july4night', at(7, 4, 22), { night: true }], ['patriotDay', at(9, 11)],
        ['halloween', at(10, 31, 20), { night: true }], ['thanksgiving', at(11, nth(y, 11, 4, 4)), cold],
        ['lightsNight', at(12, 10, 20), { night: true, ...cold }], ['christmas', at(12, 25), cold]
    ]) specs.push([name, { now: iso, ...(extra || {}) }]);
}
if (wantStates) {
    specs.push(
        ['summerAustin', { now: '2025-08-29T14:15:00-05:00', currentTemp: 98, egg: null, look: { shirt: 'texas' } }],
        ['winterSnowAlert', {
            now: '2026-01-20T09:30:00-06:00', baseTime: '2026-01-20T06:00:00-06:00', currentTemp: 26, egg: 'snowman',
            alerts: [
                { event: 'Winter Storm Warning', severity: 'Severe', onset: '2026-01-20T06:00:00-06:00', ends: '2026-01-21T06:00:00-06:00' },
                { event: 'Hard Freeze Warning', severity: 'Severe', onset: '2026-01-20T18:00:00-06:00', ends: '2026-01-21T10:00:00-06:00' }
            ],
            periods: [
                [true, 28, 80, 'Snow Likely', 'Snow likely. High near 28. North wind 15 to 20 mph, with gusts as high as 35 mph.', '15 to 20 mph', { snowIn: 2.4, liquidIn: 0.25 }],
                [false, 19, 40, 'Chance Snow', 'A chance of snow before midnight. Low around 19.', '15 mph', { snowIn: 0.5 }],
                [true, 38, 10, 'Sunny'], [false, 24, 5, 'Clear'],
                [true, 56, 0, 'Sunny'], [false, 36, 0, 'Clear'],
                [true, 62, 10, 'Partly Sunny'], [false, 42, 10, 'Partly Cloudy'],
                [true, 65, 20, 'Mostly Cloudy'], [false, 45, 20, 'Mostly Cloudy'],
                [true, 68, 10, 'Sunny'], [false, 48, 0, 'Clear']
            ]
        }],
        ['stormyNightFlood', {
            now: '2026-05-14T22:00:00-05:00', baseTime: '2026-05-14T18:00:00-05:00', currentTemp: 70, egg: null,
            alerts: [{ event: 'Flood Watch', severity: 'Moderate', onset: '2026-05-14T18:00:00-05:00', ends: '2026-05-15T18:00:00-05:00' }],
            periods: [
                [false, 68, 90, 'Showers And Thunderstorms Likely', 'Severe thunderstorms possible tonight. Rainfall amounts between 1 and 2 inches possible. Winds 20 mph with gusts as high as 45 mph.', '20 mph', { liquidIn: 1.65 }],
                [true, 76, 80, 'Showers And Thunderstorms', 'Showers and thunderstorms likely.', '15 mph', { liquidIn: 0.85 }],
                [false, 62, 30, 'Chance Showers'], [true, 81, 10, 'Mostly Sunny'],
                [false, 60, 0, 'Clear'], [true, 85, 0, 'Sunny'],
                [false, 64, 0, 'Clear'], [true, 88, 10, 'Sunny'],
                [false, 67, 10, 'Partly Cloudy'], [true, 90, 20, 'Partly Sunny'],
                [false, 70, 20, 'Partly Cloudy'], [true, 89, 15, 'Mostly Sunny']
            ]
        }],
        ['quietFullMoon', {
            now: '2026-11-24T21:00:00-06:00', baseTime: '2026-11-24T18:00:00-06:00', currentTemp: 54, egg: 'owl',
            periods: [
                [false, 48, 0, 'Clear'], [true, 71, 5, 'Sunny'],
                [false, 50, 5, 'Clear'], [true, 73, 10, 'Mostly Sunny'],
                [false, 51, 5, 'Mostly Clear'], [true, 74, 0, 'Sunny'],
                [false, 52, 0, 'Clear'], [true, 72, 10, 'Partly Sunny'],
                [false, 49, 10, 'Partly Cloudy'], [true, 70, 0, 'Sunny'],
                [false, 47, 0, 'Clear'], [true, 71, 0, 'Sunny']
            ]
        }],
        ['july4Stress', {
            now: '2026-07-04T15:00:00-05:00', baseTime: '2026-07-04T06:00:00-05:00', currentTemp: 104, egg: null,
            alerts: [
                { event: 'Excessive Heat Warning', severity: 'Extreme', onset: '2026-07-04T12:00:00-05:00', ends: '2026-07-05T20:00:00-05:00' },
                { event: 'Severe Thunderstorm Watch', severity: 'Severe', onset: '2026-07-04T16:00:00-05:00', ends: '2026-07-04T23:00:00-05:00' }
            ],
            periods: [
                [true, 104, 100, 'Showers And Thunderstorms Likely', 'Severe thunderstorms possible. Heat index values as high as 114. New rainfall amounts between a half and three quarters of an inch possible.', '20 mph'],
                [false, 88, 60, 'Chance Showers And Thunderstorms'], [true, 96, 40, 'Chance Thunderstorms'],
                [false, 84, 20, 'Partly Cloudy'], [true, 94, 20, 'Mostly Sunny'],
                [false, 82, 10, 'Clear'], [true, 95, 10, 'Sunny'],
                [false, 83, 10, 'Clear'], [true, 97, 25, 'Partly Sunny'],
                [false, 84, 15, 'Partly Cloudy'], [true, 98, 20, 'Sunny'], [false, 85, 10, 'Clear']
            ]
        }],
        ['fogValJump', {
            now: '2026-02-14T08:00:00-06:00', baseTime: '2026-02-14T06:00:00-06:00', currentTemp: 53, egg: null,
            periods: [
                [true, 55, 15, 'Areas Of Fog', 'Dense fog before 10am. Otherwise cloudy, with a high near 55. Winds 18 mph.', '18 mph'],
                [false, 52, 20, 'Patchy Fog', 'Patchy fog after 3am. Low around 52.', '10 mph'],
                [true, 56, 30, 'Mostly Cloudy'], [false, 53, 25, 'Cloudy'],
                [true, 58, 20, 'Mostly Cloudy'], [false, 54, 10, 'Partly Cloudy'],
                [true, 74, 0, 'Sunny'], [false, 55, 0, 'Clear'],
                [true, 76, 10, 'Sunny'], [false, 58, 10, 'Clear'],
                [true, 75, 10, 'Partly Sunny'], [false, 57, 10, 'Partly Cloudy']
            ]
        }]
    );
}
if (!specs.length) specs.push(['default', {}]);

fs.mkdirSync(out, { recursive: true });

function renderScenes(specs) {
    const CW = 400, CH = 480, LABEL = 28;
    const cells = [];
    for (const [name, o] of specs) {
        const now = new Date(o.now || '2026-11-20T14:00:00-06:00');
        const night = !!o.night;
        const period = Object.assign({
            isDaytime: !night, temperature: 78, temperatureUnit: 'F', shortForecast: night ? 'Clear' : 'Sunny',
            windSpeed: '5 mph', probabilityOfPrecipitation: { value: 0 },
            startTime: new Date(+now - 3600e3).toISOString(), endTime: new Date(+now + 6 * 3600e3).toISOString()
        }, o.period || {});
        const w = Object.assign(FW.analyze(period), o.w || {});
        const svg = FW.drawScene(w, o.egg ?? null, now, o.look || {});
        fs.writeFileSync(path.join(out, `${name}.svg`), svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
        cells.push([name, svg]);
    }

    const rows = Math.ceil(cells.length / cols);
    const gw = Math.min(cols, cells.length) * CW, gh = rows * (CH + LABEL);
    const side = Math.max(gw, gh), px = Math.round(side * scale);
    let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#fff"/>`;
    cells.forEach(([name, svg], i) => {
        const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + LABEL);
        sheet += (crop
            ? `<svg x="${x}" y="${y}" width="${CW}" height="${CH}" viewBox="${crop.split(',').join(' ')}">${svg}</svg>`
            : `<g transform="translate(${x} ${y})">${svg}</g>`)
            + `<text x="${x + CW / 2}" y="${y + CH + 20}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700">${name}</text>`;
    });
    sheet += '</svg>';
    const sheetPath = path.join(out, 'sheet.svg');
    fs.writeFileSync(sheetPath, sheet);

    if (process.platform === 'darwin') {
        execFileSync('qlmanage', ['-t', '-s', String(Math.min(px, 2400)), '-o', out, sheetPath], { stdio: 'ignore' });
        fs.renameSync(`${sheetPath}.png`, path.join(out, 'sheet.png'));
        console.log(path.join(out, 'sheet.png'));
    } else {
        console.log(sheetPath);
    }
}

function buildPeriods(baseIso, items) {
    const base = new Date(baseIso);
    return items.map((sp, idx) => {
        if (!Array.isArray(sp)) return sp;
        const start = new Date(base.getTime() + idx * 12 * 3600e3);
        const end = new Date(start.getTime() + 12 * 3600e3);
        return {
            number: idx + 1,
            name: sp[0] ? 'Day' : 'Night',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            isDaytime: sp[0],
            temperature: sp[1],
            temperatureUnit: 'F',
            probabilityOfPrecipitation: { value: sp[2] },
            shortForecast: sp[3],
            detailedForecast: sp[4] || sp[3],
            windSpeed: sp[5] || '8 mph',
            ...(sp[6] ? { precipitation: sp[6] } : {})
        };
    });
}

function shiftForecast(forecast, targetIso) {
    const periods = forecast.periods || [];
    if (!periods.length) return forecast;
    const refDay = periods.find(p => p.isDaytime) || periods[0];
    const target = new Date(targetIso);
    // Align refDay's 6am start to target's calendar date (preserving time-of-day offsets).
    const refStart = new Date(refDay.startTime);
    const dayShift = Math.round((target - refStart) / 864e5) * 864e5;
    return {
        ...forecast,
        periods: periods.map(p => ({
            ...p,
            startTime: new Date(+new Date(p.startTime) + dayShift).toISOString(),
            endTime: new Date(+new Date(p.endTime) + dayShift).toISOString()
        }))
    };
}

// Rasterize local HTML files to exact-dimension PNGs using macOS's built-in WebKit via JXA.
const JXA_SNAPSHOT = `
ObjC.import('Cocoa');
ObjC.import('WebKit');
ObjC.import('Foundation');
function run(argv) {
    const app = $.NSApplication.sharedApplication;
    app.setActivationPolicy($.NSApplicationActivationPolicyProhibited);
    const config = $.WKWebViewConfiguration.alloc.init;
    const webView = $.WKWebView.alloc.initWithFrameConfiguration($.NSMakeRect(0, 0, 800, 480), config);
    const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
        $.NSMakeRect(-10000, -10000, 800, 480),
        $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false
    );
    win.setContentView(webView);
    for (let i = 0; i + 3 < argv.length; i += 4) {
        const html = argv[i], out = argv[i + 1], w = Number(argv[i + 2]), h = Number(argv[i + 3]);
        win.setFrameDisplay($.NSMakeRect(-10000, -10000, w, h), false);
        webView.setFrame($.NSMakeRect(0, 0, w, h));
        const url = $.NSURL.fileURLWithPath(html);
        webView.loadFileURLAllowingReadAccessToURL(url, url.URLByDeletingLastPathComponent);
        const dl = Date.now() + 5000;
        while (webView.isLoading && Date.now() < dl) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.3));
        const cfg = $.WKSnapshotConfiguration.alloc.init;
        cfg.rect = $.CGRectMake(0, 0, w, h);
        cfg.snapshotWidth = $(w);
        let done = false, errMsg = null;
        webView.takeSnapshotWithConfigurationCompletionHandler(cfg, (img, err) => {
            if (err && err.js) errMsg = ObjC.unwrap(err.localizedDescription);
            else if (img && img.js) {
                const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
                rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(out, true);
            }
            done = true;
        });
        const sdl = Date.now() + 5000;
        while (!done && Date.now() < sdl) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
        if (errMsg) throw new Error('Snapshot failed for ' + html + ': ' + errMsg);
    }
}
`;

function renderFull(specs) {
    const sample = JSON.parse(fs.readFileSync(path.join(root, 'example-weather.json'), 'utf8'));
    const items = [];
    for (const [name, o] of specs) {
        const defaultNow = o.night ? '2025-08-29T21:30:00-05:00' : '2025-08-29T14:15:00-05:00';
        const nowIso = o.now || defaultNow;
        const now = new Date(nowIso);
        let forecast;
        if (o.forecast) {
            forecast = JSON.parse(JSON.stringify(o.forecast));
        } else if (o.periods) {
            const baseIso = o.baseTime || new Date(+now - 3 * 3600e3).toISOString();
            forecast = { periods: buildPeriods(baseIso, o.periods) };
        } else {
            forecast = o.now ? shiftForecast(sample.forecast, nowIso) : JSON.parse(JSON.stringify(sample.forecast));
        }
        if (o.period && Array.isArray(forecast.periods) && forecast.periods.length) {
            const active = FW.pickPeriod(forecast, now);
            Object.assign(active, o.period);
        }
        const current = Object.assign(JSON.parse(JSON.stringify(sample.current)), { timestamp: now.toISOString() }, o.current || {});
        if (o.currentTemp != null) {
            current.temperature = { unitCode: 'wmoUnit:degC', value: (o.currentTemp - 32) * 5 / 9 };
        }
        const location = Object.assign({}, sample.location, o.location || {});
        const alerts = o.alerts ?? null;

        const pv = { now: nowIso };
        if ('egg' in o) pv.egg = o.egg;
        if (o.look) pv.look = o.look;
        if (o.w) pv.w = o.w;

        let page = html
            .replace('`{{current|json}}`', JSON.stringify(JSON.stringify(current)))
            .replace('`{{forecast|json}}`', JSON.stringify(JSON.stringify(forecast)))
            .replace('`{{location|json}}`', JSON.stringify(JSON.stringify(location)))
            .replace('String.raw`{{alerts|json}}`', JSON.stringify(JSON.stringify(alerts)));

        const doc = `<!doctype html><html><head><meta charset="utf-8"><script>window.FUN_PREVIEW=${JSON.stringify(pv)};</script></head><body>${page}</body></html>`;
        const htmlPath = path.join(out, `${name}.html`);
        const pngPath = path.join(out, `${name}.png`);
        fs.writeFileSync(htmlPath, doc);
        items.push({ name, htmlPath, pngPath });
    }

    const useCols = Math.min(cols, items.length);
    const rows = Math.ceil(items.length / useCols);
    const pad = 16, gap = 16, labelH = 28;
    const sheetW = pad * 2 + useCols * 800 + (useCols - 1) * gap;
    const sheetH = pad * 2 + rows * (480 + labelH) + (rows - 1) * gap;

    const sheetHtmlPath = path.join(out, 'sheet.html');
    const sheetPngPath = path.join(out, 'sheet.png');

    if (process.platform === 'darwin') {
        const jxaPath = path.join(out, '.snapshot.js');
        fs.writeFileSync(jxaPath, JXA_SNAPSHOT);
        const screenArgs = items.flatMap(it => [it.htmlPath, it.pngPath, '800', '480']);
        execFileSync('osascript', ['-l', 'JavaScript', jxaPath, ...screenArgs], { stdio: 'inherit' });

        // Stitch rendered 800x480 PNGs into a labeled contact sheet
        const cells = items.map(it =>
            `<div class="c"><img src="${path.basename(it.pngPath)}" width="800" height="480"/><div class="l">${it.name}</div></div>`
        ).join('');
        fs.writeFileSync(sheetHtmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:${pad}px;background:#e5e5e5;font-family:Helvetica,Arial,sans-serif}
.g{display:grid;grid-template-columns:repeat(${useCols},800px);gap:${gap}px}
.c{display:flex;flex-direction:column;align-items:center}
img{display:block;background:#fff;box-shadow:0 0 0 1px #000}
.l{height:${labelH}px;line-height:${labelH}px;font-size:18px;font-weight:700;color:#000}
</style></head><body><div class="g">${cells}</div></body></html>`);

        if (items.length === 1) {
            fs.copyFileSync(items[0].pngPath, sheetPngPath);
            console.log(items[0].pngPath);
        } else {
            execFileSync('osascript', ['-l', 'JavaScript', jxaPath, sheetHtmlPath, sheetPngPath, String(sheetW), String(sheetH)], { stdio: 'inherit' });
            console.log(sheetPngPath);
        }
        fs.unlinkSync(jxaPath);
    } else {
        const cells = items.map(it =>
            `<div class="c"><iframe src="${path.basename(it.htmlPath)}" width="800" height="480" frameborder="0"></iframe><div class="l">${it.name}</div></div>`
        ).join('');
        fs.writeFileSync(sheetHtmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:${pad}px;background:#e5e5e5;font-family:Helvetica,Arial,sans-serif}
.g{display:grid;grid-template-columns:repeat(${useCols},800px);gap:${gap}px}
.c{display:flex;flex-direction:column;align-items:center}
iframe{display:block;background:#fff;border:1px solid #000}
.l{height:${labelH}px;line-height:${labelH}px;font-size:18px;font-weight:700;color:#000}
</style></head><body><div class="g">${cells}</div></body></html>`);
        console.log(sheetHtmlPath);
    }
}

if (wantFull) {
    renderFull(specs);
} else {
    renderScenes(specs);
}
