// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks protocols that record no token yet by an implied value derived only from the
// snapshot's own figures. No protocol name is ever special-cased: the same functions score every row.
//
//   peer multiple   for each category, the median market-cap / TVL ratio of the protocols in that
//                   category whose token already trades (ratios winsorized to [0.02, 3]). A category
//                   with at least 3 traded peers is priced by its own median. With fewer, the median
//                   is shrunk toward the global median by credibility: the traded peers' TVL against
//                   the TVL of the category's protocols still waiting for a token, w = peerTVL /
//                   (peerTVL + waitingTVL). One $12M peer does not price $8B of curators (w near 0),
//                   while two multi-billion peers do price restaking (w near 1) — the dollars of
//                   evidence, not the headcount, decide how much of the category's own median survives.
//   base            = tvl_usd x category multiple        (the FDV peers of its kind actually get)
//   momentum        = 1 + clamp(change_7d, -40, +80) / 250   (unknown change counts as 1.0)
//   maturity        = 0.85 + 0.30 x min(age_years, 4) / 4    (unknown listing date counts as 1.0)
//   propensity      = 0.65 + 0.50 x the category's token-live share, the share of the category's
//                   protocols whose token already trades, shrunk toward the global share the same
//                   way: (live + 3 x globalShare) / (total + 3). The model's premise is that a
//                   token comes one day; in categories where tokens are the norm (most lending
//                   and DEX protocols have one) that premise is well supported, and in categories
//                   that mostly manage other people's assets (risk curators, capital allocators)
//                   it is not, so their implied values are discounted rather than read as pure TVL.
//   implied value   = max(1, round(base x momentum x maturity x propensity))
//
// The board is the pre-token radar: a protocol is on it when the snapshot records no token for it
// (no CoinGecko id and no symbol) and it is not a wrapped, staked or bridged product of a token that
// already trades. The snapshot's token-bearing protocols are kept apart in the live set and shown at
// the market's own values, never mixed into the ranked board.

import { farmSteps, stepText, type FarmStep } from './farm.ts';

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-multiple-4';

/** Categories that are products of a token that already trades, never a launch of their own. */
const DERIVATIVE_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of another token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name are that exchange's product, not a launch candidate. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether the snapshot records a token for a protocol. */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol may sit on the pre-token board: no token recorded, and not a derivative product. */
export function isEligible(p: SnapshotProtocol): boolean {
  if (recordsToken(p)) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

const DAY_MS = 86_400_000;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One category's peer multiple: how the category is keyed, its multiple, how many peers back it,
 *  how much TVL those peers carry, how much TVL is still waiting for a token, and the credibility
 *  weight the category's own median kept (1 when three or more peers speak for the category). */
export interface CategoryMultiple {
  key: string;
  multiple: number;
  peers: number;
  category_median: number;
  peer_tvl_usd: number;
  waiting_tvl_usd: number;
  credibility: number;
}

/** Every category's peer multiple, read off the snapshot's token-live protocols. */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, CategoryMultiple>; globalMedian: number } {
  const ratiosByCategory = new Map<string, number[]>();
  const peerTvlByCategory = new Map<string, number>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(3, Math.max(0.02, p.mcap_usd / p.tvl_usd));
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
    peerTvlByCategory.set(key, (peerTvlByCategory.get(key) ?? 0) + p.tvl_usd);
    all.push(ratio);
  }
  const waitingTvlByCategory = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (!isEligible(p)) continue;
    const key = p.category ?? '';
    waitingTvlByCategory.set(key, (waitingTvlByCategory.get(key) ?? 0) + p.tvl_usd);
  }
  const globalMedian = median(all);
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [key, ratios] of ratiosByCategory) {
    const catMedian = median(ratios);
    const n = ratios.length;
    const peerTvl = peerTvlByCategory.get(key) ?? 0;
    const waitingTvl = waitingTvlByCategory.get(key) ?? 0;
    const credibility = n >= 3 ? 1 : peerTvl / (peerTvl + waitingTvl);
    const multiple = n >= 3 ? catMedian : credibility * catMedian + (1 - credibility) * globalMedian;
    byCategory.set(key, { key, multiple, peers: n, category_median: catMedian, peer_tvl_usd: peerTvl, waiting_tvl_usd: waitingTvl, credibility });
  }
  return { byCategory, globalMedian };
}

/** The multiple a protocol's category carries, with the global median for a category with no peers. */
export function multipleFor(byCategory: Map<string, CategoryMultiple>, globalMedian: number, category: string | null): CategoryMultiple {
  return byCategory.get(category ?? '') ?? { key: category ?? '', multiple: globalMedian, peers: 0, category_median: globalMedian, peer_tvl_usd: 0, waiting_tvl_usd: 0, credibility: 0 };
}

/** One category's token propensity: its shrunk token-live share and the factor it maps to. */
export interface CategoryPropensity {
  key: string;
  share: number;
  factor: number;
  total: number;
  live: number;
}

/**
 * Every category's token propensity, read off the snapshot itself: the share of the category's
 * protocols that already record a token, shrunk toward the global share by the category's size,
 * mapped onto a bounded factor. A category the snapshot does not carry counts as the global share.
 */
export function categoryPropensities(snapshot: Snapshot): { byCategory: Map<string, CategoryPropensity>; globalShare: number } {
  const totals = new Map<string, { total: number; live: number }>();
  let allTotal = 0;
  let allLive = 0;
  for (const p of snapshot.protocols) {
    const key = p.category ?? '';
    const cell = totals.get(key) ?? { total: 0, live: 0 };
    cell.total += 1;
    if (recordsToken(p)) cell.live += 1;
    totals.set(key, cell);
    allTotal += 1;
    if (recordsToken(p)) allLive += 1;
  }
  const globalShare = allTotal === 0 ? 0 : allLive / allTotal;
  const byCategory = new Map<string, CategoryPropensity>();
  for (const [key, cell] of totals) {
    const share = (cell.live + 3 * globalShare) / (cell.total + 3);
    byCategory.set(key, { key, share, factor: 0.65 + 0.5 * share, total: cell.total, live: cell.live });
  }
  return { byCategory, globalShare };
}

/** The propensity a protocol's category carries, with the global share for an unseen category. */
export function propensityFor(byCategory: Map<string, CategoryPropensity>, globalShare: number, category: string | null): CategoryPropensity {
  return byCategory.get(category ?? '') ?? { key: category ?? '', share: globalShare, factor: 0.65 + 0.5 * globalShare, total: 0, live: 0 };
}

/** The momentum factor from a seven-day TVL change in per cent; an unknown change is neutral. */
export function momentumFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  const clamped = Math.min(80, Math.max(-40, change7d));
  return 1 + clamped / 250;
}

/** The maturity factor from a whole-year age; an unknown listing date is neutral. */
export function maturityFactor(asOf: string, listedAt: string | null): { factor: number; age: number | null; years: number | null } {
  const age = ageDays(asOf, listedAt);
  if (age === null) return { factor: 1, age: null, years: null };
  const years = Math.floor(age / 365);
  return { factor: 0.85 + (0.3 * Math.min(years, 4)) / 4, age, years };
}

/** The share of a launch a category's history says goes to its community of farmers, as a prior. */
export const ALLOCATION_PRIORS: Record<string, number> = {
  'Chain': 0.12,
  'Dexs': 0.1,
  'Derivatives': 0.1,
  'Prediction Market': 0.09,
  'Lending': 0.08,
  'CDP': 0.08,
  'CDP Manager': 0.08,
  'Farm': 0.08,
  'Cross Chain Bridge': 0.07,
  'Staking Pool': 0.07,
  'Restaking': 0.07,
  'Yield': 0.06,
  'Yield Aggregator': 0.06,
  'Basis Trading': 0.06,
  'Insurance': 0.06,
  'Uncollateralized Lending': 0.08,
  'Leveraged Farming': 0.07,
  'Liquidity Manager': 0.06,
  'Interest Rate Derivatives': 0.07,
  'Payments': 0.07,
  'OTC Marketplace': 0.07,
  'Governance Incentives': 0.08,
  'Collateral Markets': 0.06,
  'Dual-Token Stablecoin': 0.07,
  'Stablecoin Wrapper': 0.05,
  'CeDeFi': 0.05,
  'Crypto Card Issuer': 0.08,
  'Anchor BTC': 0.05,
  'Decentralized BTC': 0.07,
  'Indexes': 0.05,
};

/** The allocation prior for a category: its table entry, or the 5% default. */
export function allocationPrior(category: string | null): number {
  if (category === null) return 0.05;
  return ALLOCATION_PRIORS[category] ?? 0.05;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One row of board.json: the ranked board's row, in the gate's shape plus the model's working. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  model: {
    multiple: number;
    peers: number;
    peer_tvl_usd: number;
    waiting_tvl_usd: number;
    credibility: number;
    momentum: number;
    maturity: number;
    propensity: number;
    propensity_share: number;
    allocation_prior: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its estimated airdrop pool and its plan as steps. */
export interface RadarRow extends Omit<BoardRow, 'farm_steps'> {
  pool_usd: number;
  farm_steps: FarmStep[];
}

/** A token-bearing protocol: it already trades, so the page shows the market's own value for it. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's peer multiple as the dashboard's model panel states it. */
export interface CategoryMultipleRow {
  category: string;
  multiple: number;
  peers: number;
  peer_tvl_usd: number;
  credibility: number;
  propensity: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  global_multiple: number;
  global_token_share: number;
  category_multiples: CategoryMultipleRow[];
  watchlist_size: number;
  board_size: number;
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { byCategory, globalMedian } = categoryMultiples(snapshot);
  const propensities = categoryPropensities(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.filter(isEligible).map((p) => {
    const mult = multipleFor(byCategory, globalMedian, p.category);
    const momentum = momentumFactor(p.change_7d);
    const maturity = maturityFactor(snapshot.as_of, p.listed_at);
    const propensity = propensityFor(propensities.byCategory, propensities.globalShare, p.category);
    const implied = Math.max(1, Math.round(p.tvl_usd * mult.multiple * momentum * maturity.factor * propensity.factor));
    return { p, mult, momentum, maturity, propensity, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.maturity.age,
    watchlist: watchlist.has(s.p.slug),
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.mult.multiple),
      peers: s.mult.peers,
      peer_tvl_usd: Math.round(s.mult.peer_tvl_usd),
      waiting_tvl_usd: Math.round(s.mult.waiting_tvl_usd),
      credibility: round4(s.mult.credibility),
      momentum: round4(s.momentum),
      maturity: round4(s.maturity.factor),
      propensity: round4(s.propensity.factor),
      propensity_share: round4(s.propensity.share),
      allocation_prior: allocationPrior(s.p.category),
    },
    farm_steps: farmSteps(s.p, s.maturity.age).map(stepText),
  }));
}

/** The snapshot's token-bearing protocols, by market cap, for the dashboard's token-live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(recordsToken)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const { byCategory, globalMedian } = categoryMultiples(snapshot);
  const propensities = categoryPropensities(snapshot);
  const boardCategories = [...new Set(board.map((r) => r.category))];
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    global_multiple: round4(globalMedian),
    global_token_share: round4(propensities.globalShare),
    category_multiples: boardCategories
      .map((category) => {
        const m = multipleFor(byCategory, globalMedian, category);
        const prop = propensityFor(propensities.byCategory, propensities.globalShare, category);
        return { category: category ?? 'Uncategorised', multiple: round4(m.multiple), peers: m.peers, peer_tvl_usd: Math.round(m.peer_tvl_usd), credibility: round4(m.credibility), propensity: round4(prop.factor) };
      })
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map((row) => {
      const p = snapshot.protocols.find((x) => x.slug === row.slug)!;
      const { farm_steps: _steps, ...rest } = row;
      return {
        ...rest,
        pool_usd: Math.round(row.implied_value_usd * row.model.allocation_prior),
        farm_steps: farmSteps(p, row.age_days),
      };
    }),
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
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${byRank[i]!.slug} outranks row ${byRank[i - 1]!.slug} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

export type { FarmStep };
