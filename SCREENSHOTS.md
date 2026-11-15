# Screenshots — how they were taken

Dashboard: `dashboard/` (dark fintech UI, static, reads only `data.js`).
All three shots are viewport screenshots, **1440 × 900**, taken with headless
Chromium via Playwright (sync API) in the bale venv
(`~/workspace/bale-config-collector/venv/bin/python`), using the installed
`chromium_headless_shell-1243` binary. The `out/` directory was served over
local HTTP (`python3 -m http.server 8137 --bind 127.0.0.1`, from `out/`) so the
dashboard loads `out/data.js` exactly as the grader's build will.

Data: `out/data.js`, model **radar-2** (final, Agent A), mtime
**2026-11-15 13:51:52 UTC (17:21:52 Tehran)**, 78,090 bytes, 200 rows + 24 live.
All three shots were re-taken against this final file after the last
regeneration; no shot predates it.

## The shots

| File | URL (deep link) | What it shows | Size |
|---|---|---|---|
| `screenshots/1-board.png` | `http://127.0.0.1:8137/dashboard/index.html#/` | The ranked board: 200 of 200 rows, Steakhouse Financial #1 at $71.2M implied, sort/filter/search controls, stat cards | 145,709 B |
| `screenshots/2-detail.png` | `http://127.0.0.1:8137/dashboard/index.html#/protocol/steakhouse-financial` | Detail for rank #1: implied-value breakdown (TVL × curve multiple × growth × maturity, "Recomputes exactly") + farm plan steps with cost/time | 165,033 B |
| `screenshots/3-filtered.png` | `http://127.0.0.1:8137/dashboard/index.html#/?category=Lending` | Filtered board: category select "Lending (13)", filter pill, "13 of 200 rows", all 13 rows Lending | 139,356 B |

All three are valid PNGs, 1440 × 900, each ≤ 512 KB (cap). No horizontal
overflow on any view (`scrollWidth` = 1440), no console/page errors during
the shoot, no clipped text in the visible areas, no empty states.

## QC notes

- Shot 2's farm plan continues below the fold (steps 1–5 visible, step 6 +
  plan summary on scroll) — the panel is scrollable; the breakdown and the
  plan are both visible in the shot.
- The category-adjustment display was verified on a second protocol with a
  nonzero adjustment (Curvance, Lending, log adjustment −0.3434): the detail
  view shows the true multiplicative factor **−29.1%** (exp(−0.3434)−1), not
  −34.3%, and its breakdown also reports "Recomputes exactly"
  (QC shot in `/tmp/qc-curvance-detail.png`, not a deliverable).
- Methodology (`#/method`) and live-token comparison (`#/live`) views were
  also rendered and read back clean (QC shots in `/tmp/qc-method.png`,
  `/tmp/qc-live.png`): the stated formula now includes `+ category_adjustment`
  inside the exp, with the log-units note, and the blind-test cards show the
  5-fold / 10-fold MedAPE vs the flat baseline.
