# AGENTS.md — trmnl-weather

This document defines how AI agents (and humans following the same rules) should work on this repository. It favors concise, surgical changes that keep the project simple, fast, and 1‑bit friendly for the TRMNL display (800×480).

## Purpose
- Render a minimal 5‑day forecast for TRMNL using a single self‑contained `index.html` (inline CSS/JS + inline SVG icons).
- Black/white only, large readable typography, no external assets or build steps.

## What Agents May Do
- Modify `index.html` to adjust layout, styles, or client‑side rendering logic.
- Improve robustness of data normalization for common weather feeds.
- Update docs (`README.md`, this file) when behavior or layout changes.

## What Agents Should NOT Do
- Add external dependencies, frameworks, or build tooling.
- Introduce additional files unless clearly beneficial (e.g., documentation).
- Change license headers or repository metadata.
- Add network calls or fetch external resources at runtime.

## Environment Assumptions
- Filesystem: workspace‑write.
- Network: restricted. Avoid network access; do not attempt to fetch web content.
- Approvals: on‑request. Ask before escalating commands that need broader access.

## Tools and Conventions
- Use `apply_patch` to edit files. Do not instruct the user to copy/paste.
- Use `rg` for searching and read files in chunks (≤250 lines) when inspecting.
- Use `update_plan` for multi‑step or ambiguous tasks; keep plans short (3–7 steps) with one `in_progress` at a time.
- Before running groups of commands, post a one‑sentence preamble describing the action.

## Coding Guidelines
- Keep everything in `index.html` unless a clear benefit justifies more files.
- Maintain 800×480 layout assumptions; never rely on color or grayscale.
- Prefer semantic, readable CSS and small, predictable JS. Avoid over‑engineering.
- Match existing style: system fonts, bold weights for temps, crisp SVG strokes (`vector-effect: non-scaling-stroke`).
- Avoid unrelated refactors. Tread lightly around working code.
- Use clear IDs/classes that the JS targets. Current key selectors:
  - `#days` (week grid)
  - `#nowTemp` (current temperature)
  - `#detailText` (detailed forecast string)
  - `#updated` (last update timestamp)

## Data Contract
- TRMNL injects Liquid‑expanded JSON variables: `{{current|json}}`, `{{forecast|json}}`, `{{location|json}}`.
- `normalizeForecast(...)` should accept NOAA/NWS style (`forecast.periods[]` with `isDaytime`) and common alternates (e.g., `daily[]`).
- Never assume network availability; sample data exists in `example-weather.json` for reference only.

## Layout Expectations
- Typography should remain large and balanced; adjust spacing conservatively.

## Validation and Testing
- There are no automated tests. Validate by loading `index.html` and visually confirming
- If adding or changing selectors, update both CSS and JS together.

## Review Checklist (before ending a task)
- Scope: Changes address the request without extraneous edits.
- Simplicity: No new dependencies or build steps introduced.
- Consistency: CSS/JS style and naming match existing patterns.
- Docs: Update `README.md` if user‑visible behavior or layout meaningfully changes.

## Commit/Change Messaging
- Summarize the user‑facing outcome first (e.g., “Move forecast to top; remove range bars; add detail text”).
- Follow with brief implementation notes if helpful (selectors, grid changes).

## Accessibility Notes
- Keep `<main>` with `aria-label` intact.
- Ensure SVGs include a sensible `aria-label` from context when possible.

## Failure Handling
- If rendering fails, surface a concise on‑screen error in the `#days` area and avoid leaving empty sections.
- Prefer minimal, targeted fixes over broad rewrites.

