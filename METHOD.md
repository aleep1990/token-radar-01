# Token Radar — Method (radar-2)

A plain-language account of how the board is scored. Everything below is computed
from the sealed snapshot (`snapshot.json`, DefiLlama protocols fetched 2026-11-14,
758 protocols, watchlist floor $50M) on every run. Nothing is hardcoded to a protocol
name, and no outside data enters the model at run time.

## The model in one paragraph

Each pre-token protocol gets an **implied value**: what its token might be worth if
it launched at the valuation the market currently gives comparable protocols that
already trade. The comparison is fitted from the snapshot itself — a curve through
the 128 live-token protocols that record a positive market cap — then adjusted for
the protocol's recent growth and for how long it has run with no token. A farm plan
then says what to do about it, costed to the dollar.

## 1. The comps curve (the valuation)

The starter model valued every protocol at a flat **TVL × 0.25**. That is wrong in a
specific, measurable way: in the snapshot's own live-token protocols, the market-cap
to TVL ratio **falls as protocols get bigger**. Median ratios by TVL bucket:

| TVL bucket | Protocols | Median mcap / TVL |
| --- | --- | --- |
| under $10M | 27 | 0.65x |
| $10M–$50M | 49 | 0.37x |
| $50M–$200M | 26 | 0.17x |
| $200M–$1B | 12 | 0.06x |
| over $1B | 14 | 0.03x |

A flat multiple overvalues the giants (it gave the $2.75B-TVL leader a $544M implied
value) and undervalues the small. So radar-2 fits a curve in **log space**:

```
log(market cap) = 6.9646 + 0.5223 × log(TVL) + category adjustment
base            = exp(log(market cap))
```

- **Comps:** the 144 protocols that record a market cap, minus 16 that record a
  zero (15) or negative (1) cap — `log(0)` is undefined, so they cannot enter a
  log-space fit. They are counted here, not silently dropped. **n = 128.**
- **Log space** is the heavy-tail treatment: ratios in the raw data run from
  0.00025x to 400x (median 0.21x, mean 5.04x). In logs, the 400x outlier is ~6 log
  units from the line, not 400x the weight of a typical comp. Trimming and
  winsorizing the log residuals were also tried (see §5); they did not improve
  held-out error, so the final fit is untrimmed OLS in log space.
- **Slope 0.52 < 1** is the whole story: predicted market cap grows with the
  square root of TVL, so the implied ratio `base / TVL` falls with size — 0.033x
  for the largest watchlist protocol, ~0.12x–0.20x for mid-size ones.
- **Category adjustments** are the mean log-residual of the category, shrunk by
  `n / (n + 10)` and clamped to ±0.35 log units (≈ ×1.42 at most), and only for
  categories with at least 5 comps. Fitted values on this snapshot:

| Category | Comps | Adjustment (log) | Factor |
| --- | --- | --- | --- |
| Basis Trading | 7 | +0.35 (capped) | ×1.42 |
| Canonical Bridge | 8 | +0.33 | ×1.39 |
| Dexs | 11 | +0.07 | ×1.07 |
| RWA | 9 | +0.09 | ×1.09 |
| Bridge | 6 | −0.03 | ×0.97 |
| Yield | 9 | −0.34 | ×0.71 |
| Lending | 15 | −0.34 | ×0.71 |
| Liquid Staking | 9 | −0.35 (capped) | ×0.71 |
| CEX | 9 | +0.35 (capped) | ×1.42 |

  Categories with fewer than 5 comps get no adjustment (0). Note the CEX and
  bridge adjustments are fitted but never applied to a board row: the board never
  ranks CEX protocols, and the watchlist excludes bridges. The adjustment is
  deliberately small — blind testing showed unshrunk category means overfit
  (see §5).

## 2. Growth and maturity (unchanged from the starter)

```
growth     = clamp(change_7d, −60%, +120%)
growthMult = 1 + (growth / 100) × 0.5
maturity   = 0.6 + min(age_days, 1095) / 1095 × 0.4     (unknown age: 365 days)
implied    = max(1, round(base × growthMult × maturity))
```

Growth is the protocol's own 7-day TVL change (missing = 0%). Maturity is time
since DefiLlama first listed the protocol — the best record of how long it has
run with no token — capped at 3 years, so a protocol older than that gets no
further credit. Both multipliers are bounded (growth 0.70–1.60, maturity
0.60–1.00), so neither can dominate the curve.

## 3. What the board covers

- **Watchlist (40):** every protocol at or above the $50M floor that records no
  token — all 40 are on the board.
- **Early rows (160):** pre-token protocols below the floor, taken by TVL, that
  are not exchanges and not versioned pools. **200 rows total.**
- **Live-token protocols (24 shown):** set aside with their actual market caps,
  never mixed into the ranking. A protocol is "pre-token" only in the sense that
  its DefiLlama record carries no token; the snapshot cannot prove it has none.

## 4. Farm plans, costed to the dollar

Every row carries 6 steps. Capital is tiered by the protocol's own TVL
($50 under $100M, $100 at $100M+, $150 at $1B+; the $250 tier at $5B+ has no
row on this snapshot). Gas is a **planning allowance per transaction** for the
protocol's first chain, from November 2026 fee trackers (quiet-time swaps were
then ~$0.07 on Ethereum, under $0.01 on the big rollups, ~$0.0004 on Solana —
fees spike 10x+ when markets get busy, so the plan budgets several times the
quiet-time fee):

| Chain | Allowance per tx |
| --- | --- |
| Ethereum | $5.00 |
| Solana | $0.01 |
| Arbitrum, Optimism, Base, zkSync, Linea, Scroll, Mantle, Blast, Mode, Taiko, Fraxtal, Ink, Unichain, Soneium, Abstract, Robinhood Chain, World Chain, Gravity | $0.10 |
| Polygon, BNB Chain, Avalanche, Tron, Cronos, Fantom, Gnosis, Celo, Sui, Aptos, NEAR, Sei, Kava, Sonic, Berachain, opBNB, Hemi | $0.25 |
| Everything else (incl. Bitcoin, Hyperliquid L1, Monad) | $0.50 |

The plan's gas adds up: setup (2 tx) + main action (approve + deposit, 2 tx) +
one weekly action per week of the hold (30 days → 5 weeks, 45 → 7, 60 → 9) +
claim (1 tx) or a second-chain action (2 tx on the second chain). Step 6 states
the total. Capital is **deployed, not spent** — it is recoverable on exit — so
the total names both: e.g. an Ethereum-only protocol at $100 capital and a
30-day hold costs $50 of gas ($10 + $10 + $25 + $5); the same plan on Solana
costs $0.10. Across the board, total gas runs $0.10–$70 (median $6).

## 5. Blind test — is the curve actually better?

5-fold and 10-fold cross-validation on the 128 comps (sorted by slug, fold =
index mod k, so no protocol trains the curve that predicts it), predicting market
cap from TVL alone, curve vs. the starter's flat TVL × 0.25 on the same folds:

| | 5-fold MAPE | 5-fold MedAPE | 10-fold MAPE | 10-fold MedAPE |
| --- | --- | --- | --- | --- |
| **Curve (radar-2)** | **1,278.5%** | **85.0%** | **1,131.3%** | **84.7%** |
| Flat 0.25x (starter) | 1,716.3% | 88.7% | 1,716.3% | 88.7% |

MAPE = mean absolute percentage error; MedAPE = median absolute percentage
error. The mean is dominated by a handful of 10–400x outliers (one comp's token
is worth 400x its TVL), so **the median is the honest headline**: the curve cuts
typical error from ~89% to ~85% (about 4 points), and mean error by ~25–34%.
Variants tried and what happened (5-fold): plain log-log OLS without category
adjustments — MAPE 1,127%, MedAPE 85.7%; trimmed OLS (|residual| ≤ 2) —
1,316% / 84.4%; winsorized OLS — 1,112% / 87.4%; unshrunk category means —
1,791% / 85.0%. The category adjustment as shipped (shrunk, capped) is close to
neutral on the median and worse than plain OLS on the mean; it is kept because
it is small, bounded, and directionally right (Lending/Yield/Liquid Staking
genuinely trade below the curve), not because it wins the blind test.

## 6. Limitations — read this before trusting any number

- **The fit is weak: R² = 0.19, residual SD = 2.08 log units.** TVL alone
  explains little of a token's market cap. A typical prediction is off by ~85%;
  the board ranks protocols by a noisy estimate, and the ranking is the point —
  the dollar figures are not prices.
- **Comps are survivors.** Live-token protocols are the ones that already
  launched and kept a token; pre-token protocols may never launch, and if they
  do, their tokens may list far from any comp.
- **The curve is fitted to one day** (2026-11-14). Re-run on a different
  snapshot, the coefficients move. The program refits from whatever snapshot it
  is given, so the numbers above are for this snapshot only.
- **Gas allowances are budgets, not quotes.** They move with gas markets; check
  the explorer before sending anything.
- **Implied value is the entry's own claim**, not a prediction of whether or
  when a token is issued, and not financial advice.

## 7. Reproducibility

`lib/model.ts`, standard library only, no network, no randomness, no clock
(except the snapshot's own `as_of` date). The curve is refitted from the input
on every run; the same snapshot bytes produce byte-identical output (verified:
two runs to different directories, `diff -r` clean). `main.ts` refuses to write
a board that fails the gate (`boardIssue` null on this snapshot; 200 rows,
ranks 1–200, strictly descending implied values, 6 farm steps per row, each
20–600 characters). Model version: `radar-2`.
