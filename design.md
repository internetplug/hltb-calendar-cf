# HowLongToBeat Calendar — Design Direction

## Concept
HUD/tactical gaming UI. Think deep space ops dashboard — angular, sharp, intentional. Inspired by the Sonic Blocks reference: dark void backgrounds, floating geometry, glowing edges. Desaturated and neutral-toned with cyan as the single accent color.

## Colors
- `--bg-void`: `#0a0a0c` — near-black base, slightly warm
- `--bg-surface`: `#111114` — card/panel backgrounds
- `--bg-elevated`: `#18181d` — elevated surfaces, hover states
- `--border`: `#2a2a32` — subtle dividers
- `--border-glow`: `#00e5ff22` — cyan glow borders (active states)
- `--text-primary`: `#e8e8ec` — warm off-white, not pure white
- `--text-secondary`: `#7a7a8a` — muted label text
- `--text-muted`: `#3a3a48` — disabled/placeholder
- `--accent`: `#00e5ff` — cyan, used sparingly for active state, key highlights
- `--accent-dim`: `#00b8cc` — darker cyan for hover
- `--accent-glow`: `#00e5ff40` — cyan glow for shadows
- `--danger`: `#ff4466` — warnings/remove actions
- `--success`: `#00cc88` — completion indicators

## Typography
- Display/Headers: `"Rajdhani"` — geometric, military feel, condensed
- Body/UI: `"DM Mono"` — monospaced, technical, readable
- Both from Google Fonts

## Spacing
- Dense information layout with clear section separation
- 4px base unit, 8/12/16/24/32/48 scale
- Angular clip-paths on key containers (skewed corners)

## UI Patterns
- Panels with `clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)` cut corners
- Thin 1px cyan border on active/selected elements
- Glow effects via `box-shadow: 0 0 16px var(--accent-glow)`
- Progress bars as segmented blocks, not smooth bars
- Hover states: subtle background lift + cyan border flash
- Tags/badges with uppercase tracking

## Layout
- Left sidebar: game library + add game
- Main content: calendar view (monthly / weekly) with view switcher
- Top bar: app name + schedule config
- No rounded corners on primary UI (4px max)
