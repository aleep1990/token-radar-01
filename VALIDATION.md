# Token Radar-2 — Validation

All numbers below were produced from the sealed snapshot
(`token-radar-01-kit/input/snapshot.json`, as_of 2026-11-14, 758 protocols) by
the shipped program itself (`lib/model.ts`, `fitCurve` / `crossValidate` /
`validateCurve`) or by re-running it; the Python cross-checks in §4 used the
same snapshot independently and agree to the digit.

## 1. Blind test: curve vs. starter flat 0.25x

K-fold cross-validation on the 128 comps (positive market cap and TVL; 15 record
a zero cap and 1 a negative cap, unusable in log space). Deterministic folds:
comps sorted by slug, fold = index mod k. Predicts market cap from TVL alone
(no growth/maturity — those adjust pre-token scores, they are not part of the
mcap fit). Same folds for both models.

| Model | 5-fold MAPE | 5-fold MedAPE | 10-fold MAPE | 10-fold MedAPE |
| --- | --- | --- | --- | --- |
| **Curve, radar-2 (OLS + shrunk capped category adj.)** | **1,278.5%** | **85.0%** | **1,131.3%** | **84.7%** |
| Flat TVL × 0.25 (starter, radar-1) | 1,716.3% | 88.7% | 1,716.3% | 88.7% |
| **Improvement** | −25.5% | −3.7 pp | −34.1% | −4.0 pp |

MAPE = mean absolute percentage error, MedAPE = median absolute percentage
error. MAPE is dominated by a handful of 10–400x outliers (worst comp: 400.2x
mcap/TVL), so MedAPE is the headline: typical error 88.7% → 85.0% (5-fold).
These exact numbers are also embedded in every run's output
(`out/data.js`: `RADAR.validation.five_fold` / `.ten_fold`) for the dashboard
to display.

### Variants tried (5-fold, same protocol)

| Variant | MAPE | MedAPE | Verdict |
| --- | --- | --- | --- |
| Plain log-log OLS, no category adj. | 1,127.2% | 85.7% | Best MAPE; MedAPE ~same as shipped |
| Winsorized OLS (±2.0 log) | 1,111.5% | 87.4% | Best MAPE, worst MedAPE |
| Trimmed OLS (\|resid\| ≤ 2.0, refit) | 1,316.2% | 84.4% | Worse MAPE |
| Trimmed OLS (\|resid\| ≤ 1.5) | 921.9% | 85.0% | Best MAPE of all, but keeps only 73/128 comps |
| Theil–Sen (median slope) | 1,123.0% | 85.9% | ≈ OLS |
| Unshrunk category means | 1,790.8% | 85.0% | Overfits: MAPE worse than flat |
| Shrunk (k=10) + capped (±0.35) category adj. — **shipped** | 1,278.5% | 85.0% | Near-neutral on MedAPE vs plain OLS, worse on MAPE |

Why ship the category adjustment if plain OLS wins on MAPE? The adjustment is
kept small and bounded (±0.35 log, ≈ ×1.42 max) for interpretability — Lending /
Yield / Liquid Staking genuinely sit ~0.7x below the curve — and its MedAPE
equals plain OLS. The honest statement is in METHOD.md §5: the adjustment does
not win the blind test; the size slope does. The trimmed-1.5 variant was
rejected because it throws away 43% of the comps to buy MAPE.

### Fit quality (full 128 comps)

- `log(mcap) = 6.9646 + 0.5223 × log(TVL)`, R² = 0.194, residual SD = 2.08 log units.
- Slope < 1: the implied mcap/TVL ratio falls with size — the effect the flat
  multiple misses. Median ratio 0.65x below $10M TVL → 0.03x above $1B.

## 2. Starter vs. new: top-10 changes

| Rank | Protocol | Starter implied | New implied | Change |
| --- | --- | --- | --- | --- |
| 1 | steakhouse-financial | $543.6M | $71.2M | ×0.13 |
| 2 | gauntlet | $323.8M | $55.3M | ×0.17 |
| 3 | veda | $311.3M | $53.4M | ×0.17 |
| 4 | usdd | $214.2M | $44.3M | ×0.21 |
| 5 | upshift | $111.7M | $33.1M | ×0.30 |
| 6 | onre | $60.1M | $24.4M | ×0.41 |
| 7 | opentrade | $51.4M | $23.5M | ×0.46 |
| 8 | symbiotic | $55.1M | $22.5M | ×0.41 |
| 9 | plume-vaults | $45.5M | $22.2M | ×0.49 |
| 10 | nonce-capital | $75.3M | $22.0M | ×0.29 |

Top 4 names are unchanged; the order below them moves. Notable moves:
bittensor-dtao #8 → #11 ($56.4M → $20.5M); plume-vaults #12 → #9;
lofty #22 → #16; clearstar #20 → #21. Across all 200 rows the median rank
move is 10.5, mean 16.2, max 64; 100 rows move more than 10 ranks, 56 more
than 20. The re-ranking is real, not cosmetic — and it is driven by size, not
by any hand-picked name.

## 3. Implied-value distribution

| | Starter (radar-1) | New (radar-2) |
| --- | --- | --- |
| Max (rank 1) | $543.6M | $71.2M |
| p90 | $26.1M | $15.5M |
| Median | $4.1M | $5.3M |
| p10 | $1.6M | $2.9M |
| Min (rank 200) | $1.13M | $2.17M |

The new board is far more compressed at the top (the giants are cut ~7x) and
slightly higher in the middle (small protocols get the higher multiples the
comps actually show). No row is at the $1 floor; the smallest implied value is
$2.17M.

## 4. Sanity checks (all passed)

- **Gate:** `main.ts` exits 0; `boardIssue` returns null. 200 rows, watchlist
  40/40 covered, ranks exactly 1–200, implied values strictly descending
  (0 ties), every implied value a positive integer.
- **Determinism:** two runs to different output directories are byte-identical
  (`diff -r` clean) — same input → byte-identical `board.json`, `data.js`,
  `dossier.json`.
- **Cross-check:** the TypeScript fit (intercept 6.9646, slope 0.5223, R² 0.194)
  and the 5-/10-fold CV numbers reproduce an independent Python OLS/CV on the
  same snapshot exactly.
- **Farm steps:** 6 steps on every row; every step 20–600 chars (observed
  153–216); every step carries `Cost:` and `Time:`; step 6's total gas equals
  the sum of the plan's gas lines (spot-checked: Ethereum-only $100/30d =
  $10+$10+$25+$5 = $50; Solana $100/30d = $0.02+$0.02+$0.05+$0.01 = $0.10;
  Base-first with Ethereum second chain = $0.20+$0.20+$0.50+$10 = $10.90,
  shown as $11 after whole-dollar rounding).
- **Farm costing coverage:** total gas $0.10–$70 across the board, median $6.00,
  mean $19.37. Capital tiers used: $50 × 173 rows, $100 × 23, $150 × 4; the
  $250 tier (TVL ≥ $5B) has no row on this snapshot. 74 rows get a second-chain
  step, 126 the points/claim step.
- **No name special-casing:** the model reads only `tvl_usd`, `change_7d`,
  `listed_at`, `category`, `chains` — verified by inspection of `lib/model.ts`.
- **No network, no randomness:** standard library only; the program reads the
  snapshot file and writes output files.
- **Output sizes:** `out/board.json` 317,219 B; `out/data.js` 75,969 B;
  `out/dossier.json` 711,938 B (under the 1.5 MB cap).

## 5. Verdict

**Yes, demonstrably better — but modestly, and the honest size of the win is
small.** The curve beats the starter's flat 0.25x on every blind-test cut:
MedAPE 85.0% vs 88.7% (5-fold), 84.7% vs 88.7% (10-fold); MAPE down 25–34%.
The improvement is real and comes from the one robust signal in the comps —
the mcap/TVL ratio falls with size (slope 0.52) — not from the category
adjustments, which are near-neutral. But the absolute errors remain enormous
(typical prediction off by ~85%, R² 0.19): TVL alone barely explains market
cap, so the new board is a better *ranking* of a noisy estimate, not a precise
valuation. The biggest practical change is not accuracy but scale honesty: the
top implied value falls from an implausible $544M to $71M, and the ranking
moves (median 10.5 ranks) toward smaller, faster-growing protocols the flat
multiple undervalued.
