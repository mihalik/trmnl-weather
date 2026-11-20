#!/usr/bin/env node
// Render fun.html's scene (left half) for chosen dates / weather / easter eggs, offline.
//
//   node scripts/preview-scene.js [options] [name='{json}' ...]
//
// Each scene spec is name=JSON with any of:
//   now     ISO time (default 2026-11-20T14:00-06:00); drives holidays, moon, outfit rolls
//   night   true for a night period
//   egg     easter egg key (see --eggs), or null
//   period  NWS period overrides, e.g. {"temperature":96,"shortForecast":"Rain"}
//   w       overrides for the analyzed weather, e.g. {"tier":"tank","windy":true}
//   look    outfit overrides passed to drawScene, e.g. {"swim":true,"shirt":"apple"}
//
// Options:
//   --eggs        add one scene per easter egg (night ones at night)
//   --holidays    add one scene per holiday in the current year
//   --file F      markup file (default fun.html)
//   --out DIR     output directory (default /tmp/fun-preview)
//   --cols N      sheet columns (default 4)
//   --scale N     zoom the sheet, e.g. 2 to inspect details (default 1)
//   --crop x,y,w,h  show only that region of each scene, scaled up to fill its cell
//
// Writes DIR/<name>.svg for each scene and DIR/sheet.svg (labeled grid). On macOS it
// also rasterizes the sheet to DIR/sheet.png with Quick Look (qlmanage), which only
// makes square thumbnails, so the sheet is padded to a square.
//
// Only the shared (scene) script above the trmnl:split marker is used; the right-hand
// panel needs the full page, so check that with a TRMNL screenshot instead.

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
const cols = +opt('--cols', 4);
const scale = +opt('--scale', 1);
const crop = opt('--crop', null);
const wantEggs = flag('--eggs');
const wantHolidays = flag('--holidays');

const html = fs.readFileSync(file, 'utf8');
const shared = html.split('<!-- trmnl:split')[0];
const code = [...shared.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const ctx = { console, Intl, Date, Math, JSON, String, Number, Object, Array, isFinite, parseFloat };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const FW = ctx.FunWeather;

const specs = args.map(a => {
    const i = a.indexOf('=');
    if (i < 0) throw new Error(`Expected name=JSON, got ${a}`);
    return [a.slice(0, i), JSON.parse(a.slice(i + 1))];
});
if (wantEggs) {
    const nightOnly = new Set(['owl', 'shootingStar', 'ufo']);
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
if (!specs.length) specs.push(['default', {}]);

fs.mkdirSync(out, { recursive: true });
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
    sheet += crop
        ? `<svg x="${x}" y="${y}" width="${CW}" height="${CH}" viewBox="${crop.split(',').join(' ')}">${svg}</svg>`
        : `<g transform="translate(${x} ${y})">${svg}</g>`
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
