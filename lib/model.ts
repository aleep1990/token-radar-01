// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures. The valuation curve is FITTED, at run
// time, from the snapshot's own live-token protocols (the comps) — it is not a hardcoded multiple:
//
//   comps      = protocols with mcap_usd > 0 and tvl_usd > 0 (128 of the 144 that record a market
//                  cap; 15 record 0 and 1 records a negative cap, and log(0) is undefined, so they
//                  cannot enter a log-space fit and are counted, not silently dropped)
//   log mcap   = INTERCEPT + SLOPE x log tvl + categoryAdjustment[category]
//                  (ordinary least squares in log space, so the heavy tail — mcap/TVL ratios from
//                  0.00025x to 400x — is fitted in logs, where a 400x outlier is ~6 log units, not
//                  400x the weight of a typical comp)
//   categoryAdjustment = clamp( n / (n + 10) x mean residual of the category, -0.35, +0.35 ),
//                  only for categories with at least 5 comps; every other category gets 0. The
//                  shrinkage (n/(n+10)) and the ±0.35 cap (≈ ×1.42 at most) exist because blind
//                  testing showed unshrunk category means overfit: they cut the median error by
//                  nothing and roughly doubled the mean error out of sample.
//   base       = exp(log mcap)                       (the curve's predicted market cap)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The fitted curve on this snapshot is roughly log mcap = 6.96 + 0.52 x log tvl: the implied
// mcap/TVL ratio FALLS with size (median 0.65x below $10M TVL, 0.03x above $1B), which is exactly
// what a flat 0.25x multiple gets wrong — it overvalues the giants and undervalues the small.
// Blind-tested (5-fold, comps held out by slug order, predicting mcap from TVL alone): the curve's
// median absolute percentage error is ~85% against the flat 0.25x's ~89%, and its mean absolute
// percentage error ~1,280% against ~1,716% — the mean is dominated by a handful of 10–400x
// outliers, so the median is the honest headline and the mean is reported beside it. Either way
// the fit is weak (R² ≈ 0.19): TVL alone explains little of a token's market cap, and METHOD.md
// says so. No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the growth/maturity weights and the category-adjustment hyperparameters. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Shrinkage for a category's mean residual: n / (n + category_shrinkage). */
  category_shrinkage: number;
  /** A category adjustment is clamped to ±category_cap log units. */
  category_cap: number;
  /** A category needs at least this many comps to get any adjustment. */
  category_min_n: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_shrinkage: 10,
  category_cap: 0.35,
  category_min_n: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The comps-fitted valuation curve, refitted from the snapshot on every run. */
export interface FittedCurve {
  /** Intercept of log(mcap) on log(TVL). */
  intercept: number;
  /** Slope of log(mcap) on log(TVL). Below 1: the mcap/TVL ratio falls with size. */
  slope: number;
  /** Shrunk, capped log adjustments by category; absent categories get 0. */
  category_adjustments: Record<string, number>;
  /** Comps that entered the fit (positive market cap and TVL). */
  n_comps: number;
  /** Protocols that record a market cap but could not enter a log fit (cap <= 0). */
  n_excluded_nonpositive_mcap: number;
  /** R² of the log-log fit, before category adjustments. */
  r_squared: number;
  /** Standard deviation of the log residuals, before category adjustments. */
  residual_sd: number;
}

/** One fold count's blind-test result: the curve against the starter's flat 0.25x, same folds. */
export interface FoldValidation {
  folds: number;
  n_comps: number;
  /** Mean absolute percentage error of the curve's held-out mcap predictions. */
  curve_mape_pct: number;
  /** Median absolute percentage error of the curve's held-out mcap predictions. */
  curve_medape_pct: number;
  /** Mean absolute percentage error of flat TVL x 0.25 on the same folds. */
  flat_mape_pct: number;
  /** Median absolute percentage error of flat TVL x 0.25 on the same folds. */
  flat_medape_pct: number;
}

/** The blind test, run at build time from the snapshot's own comps. */
export interface ValidationSummary {
  five_fold: FoldValidation;
  ten_fold: FoldValidation;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    /** The curve's effective mcap/TVL ratio for this row, before growth and maturity. */
    curve_multiple: number;
    /** This row's category adjustment in log units (0 when its category has too few comps). */
    category_adjustment: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  /** Effective mcap/TVL ratio from the fitted curve, before growth and maturity. */
  curve_multiple: number;
  category_adjustment: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fitted curve and its blind test. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  curve: FittedCurve;
  validation: ValidationSummary;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The comps: live-token protocols whose market cap and TVL are both positive, slug order. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Ordinary least squares of log(mcap) on log(TVL) over `rows`, in slug order for determinism. */
function olsLogLog(rows: SnapshotProtocol[]): { intercept: number; slope: number; rSquared: number; residualSd: number } {
  const xs = rows.map((p) => Math.log(p.tvl_usd));
  const ys = rows.map((p) => Math.log(p.mcap_usd as number));
  const n = rows.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssr += r * r;
  }
  return {
    intercept,
    slope,
    rSquared: sst === 0 ? 0 : 1 - ssr / sst,
    residualSd: Math.sqrt(ssr / Math.max(1, n)),
  };
}

/** The shrunk, capped category adjustments for a fitted log-log line. */
function categoryAdjustments(rows: SnapshotProtocol[], intercept: number, slope: number, model: ModelConstants): Record<string, number> {
  const byCategory = new Map<string, number[]>();
  for (const p of rows) {
    const key = p.category ?? 'Other';
    const residual = Math.log(p.mcap_usd as number) - (intercept + slope * Math.log(p.tvl_usd));
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [residual]);
    else list.push(residual);
  }
  const adjustments: Record<string, number> = {};
  for (const key of [...byCategory.keys()].sort()) {
    const list = byCategory.get(key)!;
    if (list.length < model.category_min_n) continue;
    const mean = list.reduce((s, r) => s + r, 0) / list.length;
    const shrunk = (list.length / (list.length + model.category_shrinkage)) * mean;
    adjustments[key] = Math.max(-model.category_cap, Math.min(model.category_cap, shrunk));
  }
  return adjustments;
}

/** Fit the comps curve from a list of comp rows (the whole snapshot, or one training fold). */
export function fitCurveFromRows(rows: SnapshotProtocol[], model: ModelConstants = MODEL): FittedCurve {
  const sorted = [...rows].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const ols = olsLogLog(sorted);
  return {
    intercept: ols.intercept,
    slope: ols.slope,
    category_adjustments: categoryAdjustments(sorted, ols.intercept, ols.slope, model),
    n_comps: sorted.length,
    n_excluded_nonpositive_mcap: 0,
    r_squared: ols.rSquared,
    residual_sd: ols.residualSd,
  };
}

/** Fit the comps curve from the snapshot, counting the records a log fit cannot use. */
export function fitCurve(snapshot: Snapshot, model: ModelConstants = MODEL): FittedCurve {
  const curve = fitCurveFromRows(compsOf(snapshot), model);
  curve.n_excluded_nonpositive_mcap = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length;
  return curve;
}

/** The curve's predicted market cap for a protocol, before growth and maturity. */
export function curveBase(protocol: SnapshotProtocol, curve: FittedCurve): { base: number; curveMultiple: number; categoryAdjustment: number } {
  const categoryAdjustment = curve.category_adjustments[protocol.category ?? 'Other'] ?? 0;
  const logMcap = curve.intercept + curve.slope * Math.log(protocol.tvl_usd) + categoryAdjustment;
  const base = Math.exp(logMcap);
  return { base, curveMultiple: base / protocol.tvl_usd, categoryAdjustment };
}

/** The multipliers and the implied value one protocol gets under `model` and `curve`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  curve: FittedCurve,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; curveMultiple: number; categoryAdjustment: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { base, curveMultiple, categoryAdjustment } = curveBase(protocol, curve);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age, curveMultiple, categoryAdjustment };
}

/** Mean and median absolute percentage error of predictions against actual market caps. */
function apeStats(predicted: number[], actual: number[]): { mape: number; medape: number } {
  const apes = predicted.map((p, i) => Math.abs(p - actual[i]!) / actual[i]!).sort((a, b) => a - b);
  const mape = (apes.reduce((s, a) => s + a, 0) / Math.max(1, apes.length)) * 100;
  const mid = Math.floor(apes.length / 2);
  const medape = (apes.length % 2 === 1 ? apes[mid]! : (apes[mid - 1]! + apes[mid]!) / 2) * 100;
  return { mape, medape };
}

/**
 * Blind test, k-fold: comps in slug order, fold = index % k, so the split is deterministic and no
 * protocol's own record trains the curve that predicts it. Predicts market cap from TVL alone
 * (no growth/maturity: those adjust pre-token scores, they are not part of the mcap fit).
 */
export function crossValidate(snapshot: Snapshot, folds: number, model: ModelConstants = MODEL): FoldValidation {
  const comps = compsOf(snapshot);
  const curvePred: number[] = [];
  const flatPred: number[] = [];
  const actual: number[] = [];
  for (let k = 0; k < folds; k++) {
    const train = comps.filter((_, i) => i % folds !== k);
    const test = comps.filter((_, i) => i % folds === k);
    const curve = fitCurveFromRows(train, model);
    for (const p of test) {
      curvePred.push(curveBase(p, curve).base);
      flatPred.push(p.tvl_usd * 0.25);
      actual.push(p.mcap_usd as number);
    }
  }
  const curveStats = apeStats(curvePred, actual);
  const flatStats = apeStats(flatPred, actual);
  return {
    folds,
    n_comps: comps.length,
    curve_mape_pct: round2(curveStats.mape),
    curve_medape_pct: round2(curveStats.medape),
    flat_mape_pct: round2(flatStats.mape),
    flat_medape_pct: round2(flatStats.medape),
  };
}

/** The blind test at both fold counts, run from the snapshot's own comps. */
export function validateCurve(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationSummary {
  return { five_fold: crossValidate(snapshot, 5, model), ten_fold: crossValidate(snapshot, 10, model) };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const curve = fitCurve(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, curve);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision on purpose: the dashboard recomputes implied value as
      // tvl x curve_multiple x growth x maturity, and a rounded multiple
      // would drift from the board's integer by up to ~$1k on the largest rows.
      curve_multiple: s.curveMultiple,
      category_adjustment: round4(s.categoryAdjustment),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * Planning allowance for one DeFi transaction on a chain, in whole dollars. These are budgets, not
 * quotes: November 2026 fee trackers put a quiet-time swap near $0.07 on Ethereum, under $0.01 on
 * the big rollups and about $0.0004 on Solana, but fees spike 10x+ when markets get busy, so the
 * plan budgets several times the quiet-time fee and the total below is the sum of those allowances.
 * No chain is ever special-cased by protocol name — only by the chain the snapshot itself names.
 */
export function gasPerTxUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 5;
  if (c.includes('solana')) return 0.01;
  const l2 = ['arbitrum', 'optimism', 'base', 'zksync', 'linea', 'scroll', 'mantle', 'blast', 'mode', 'taiko', 'fraxtal', 'ink', 'unichain', 'soneium', 'abstract', 'robinhood', 'world chain', 'gravity'];
  if (l2.some((name) => c.includes(name))) return 0.1;
  const cheapL1 = ['polygon', 'binance', 'bnb', 'avalanche', 'tron', 'cronos', 'fantom', 'gnosis', 'celo', 'sui', 'aptos', 'near', 'sei', 'kava', 'sonic', 'berachain', 'opbnb', 'hemi'];
  if (cheapL1.some((name) => c.includes(name))) return 0.25;
  return 0.5;
}

/** Dollars as the farm plan writes them: cents below $10, whole dollars above. */
export function fmtMoney(n: number): string {
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Whole weeks inside a hold, so the weekly actions and the gas total agree. */
function holdWeeksFor(age: number | null): number {
  return Math.max(1, Math.ceil(holdDaysFor(age) / 7));
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('launchpad')) return `Commit $${capital} of USDC to ${name}'s next sale on ${chain} and hold the allocation.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, costed to the dollar.
 * Gas is the chain's planning allowance (see gasPerTxUsd); capital is deployed, not spent — it
 * comes back on exit — so the total names both separately: "$X capital deployed + ~$Y gas".
 * Weeks = ceil(hold days / 7); every gas line in the plan adds up to the total in step 6.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const fee = gasPerTxUsd(chain);
  const fee2 = secondChain === null ? 0 : gasPerTxUsd(secondChain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = holdWeeksFor(age);
  const setupGas = 2 * fee;
  const mainGas = 2 * fee;
  const weeklyGas = weeks * fee;
  const extraGas = secondChain === null ? fee : 2 * fee2;
  const totalGas = setupGas + mainGas + weeklyGas + extraGas;
  const action = actionFor(p, capital, chain);
  const secondStep: FarmStep =
    secondChain === null
      ? {
          text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
          cost: `no fee to check, ${fmtMoney(fee)} of gas if you claim on chain`,
          time: '10 minutes',
        }
      : {
          text: `Repeat one smaller action on ${secondChain} — the protocol also runs there — so the position is not single-chain only.`,
          cost: `${fmtMoney(2 * fee2)} of gas for the two transactions`,
          time: '15 minutes',
        };
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${fmtMoney(setupGas)} of ${chain} gas to fund it and approve the first token`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital deployed and ${fmtMoney(mainGas)} of ${chain} gas for approve plus deposit`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week for ${weeks} weeks — a deposit, a borrow, a swap or a vote — so the wallet stays active.`,
      cost: `${fmtMoney(fee)} of ${chain} gas a week, ${fmtMoney(weeklyGas)} over ${weeks} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays deployed in the position`,
      time: `${hold} days`,
    },
    secondStep,
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then exit only after the hold ends.`,
      cost: `total ${fmtMoney(totalGas)} of gas; $${capital} of capital deployed, recoverable on exit`,
      time: '5 minutes to log',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    curve_multiple: row.model.curve_multiple,
    category_adjustment: row.model.category_adjustment,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    curve: fitCurve(snapshot, model),
    validation: validateCurve(snapshot, model),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
