// Farm plans: what a reader does this week to be counted by a protocol before it launches.
//
// Every plan is generated from the protocol's own record: its category picks the playbook, its first
// chain prices the gas, its TVL sizes the position, and its age sets the holding window. No protocol
// name is special-cased. Each step carries its action, what it costs and how long it takes, and the
// board writes them as one string per step.

/** The slice of a protocol record the playbooks read. */
export interface FarmProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string for board.json: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check in weekly.`;
  return s;
}

/** What one transaction costs on a chain, in the bands a farmer actually pays. */
export interface GasBand {
  label: string;
  perTx: string;
}

const L2_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Linea', 'Scroll', 'zkSync Era', 'Mantle', 'Mode', 'Blast',
  'Taiko', 'Unichain', 'Ink', 'Soneium', 'Katana', 'Abstract', 'Bob', 'World Chain', 'Zora',
]);

/** The gas band of a chain: Ethereum is dear, Solana is dust, L2s sit between, other L1s below them. */
export function gasBand(chain: string | null): GasBand {
  if (chain === 'Ethereum') return { label: 'Ethereum mainnet', perTx: '$5-$25' };
  if (chain === 'Solana') return { label: 'Solana', perTx: '$0.01-$0.10' };
  if (chain !== null && L2_CHAINS.has(chain)) return { label: chain, perTx: '$0.10-$2' };
  if (chain === 'Bitcoin') return { label: 'Bitcoin', perTx: '$1-$5' };
  return { label: chain ?? 'its main chain', perTx: '$0.05-$1.50' };
}

/** The first chain a protocol names, or null when it names none. */
export function firstChain(p: FarmProtocol): string | null {
  return p.chains.length > 0 ? p.chains[0]! : null;
}

/** A position size a small farmer can actually run, scaled to the protocol's own TVL. */
export function positionFor(tvl: number): { low: number; high: number; label: string } {
  if (tvl >= 1_000_000_000) return { low: 1000, high: 5000, label: '$1,000-$5,000' };
  if (tvl >= 250_000_000) return { low: 500, high: 2000, label: '$500-$2,000' };
  if (tvl >= 50_000_000) return { low: 250, high: 1000, label: '$250-$1,000' };
  if (tvl >= 10_000_000) return { low: 100, high: 500, label: '$100-$500' };
  return { low: 50, high: 250, label: '$50-$250' };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null) return 45;
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  return 30;
}

interface Playbook {
  /** The core position, with {pos} the position label, {chain} the chain label and {name} the protocol. */
  open: string;
  /** The recurring qualifying activity. */
  weekly: string;
  /** One deeper action that separates a farmer from a drive-by deposit. */
  deepen: string;
}

/** The playbooks, by exact DefiLlama category. Anything unlisted falls back to GENERIC. */
const PLAYBOOKS: Record<string, Playbook> = {
  'Dexs': {
    open: 'Swap {pos} of volume through {name} on {chain} in 4-6 trades, then park half of it in the deepest stablecoin pool as liquidity',
    weekly: 'Make 2-3 swaps a week of $50-$200 each and add or remove a small slice of liquidity so the wallet shows repeat, organic flow',
    deepen: 'Route one trade through the aggregator or limit-order surface if {name} offers one, and vote with any LP receipt the pool issues',
  },
  'Lending': {
    open: 'Supply {pos} of USDC or ETH to {name} on {chain} in its main market, then borrow 25-35% against it and repay within the week',
    weekly: 'Adjust the supplied amount once a week, roll the borrow and repay cycle, and keep utilisation under 60% so no liquidation can touch it',
    deepen: 'Supply a second asset the market is short of (check the highest supply rate) so the wallet counts as a balanced two-sided user',
  },
  'Risk Curators': {
    open: 'Deposit {pos} into the largest curated vault {name} runs on {chain}, choosing the vault whose underlying you would hold anyway',
    weekly: 'Top up or partially withdraw once a week so the vault records recurring deposits, and claim any vault rewards into the same wallet',
    deepen: 'Split a second, smaller deposit into a different vault of the same curator to count as a multi-vault user rather than a single bet',
  },
  'Onchain Capital Allocator': {
    open: 'Allocate {pos} to {name} on {chain} through its main vault or strategy, and keep the share tokens in the farming wallet',
    weekly: 'Rebalance once a week between two strategies if the allocator offers them, and compound any harvested yield back into the position',
    deepen: 'Hold the position through one full strategy rotation or epoch, which is the window allocators usually snapshot for points',
  },
  'Yield': {
    open: 'Deposit {pos} of a yield-bearing asset into {name} on {chain} and hold the receipt token where the protocol tracks balances',
    weekly: 'Harvest and re-deposit the yield once a week, and add a small top-up so the balance grows instead of sitting flat',
    deepen: 'Lock or extend the position for one term if {name} offers a lock, since locked balances are the ones yield protocols reward first',
  },
  'Yield Aggregator': {
    open: 'Deposit {pos} into the flagship auto-compounding vault of {name} on {chain} and leave compounding switched on',
    weekly: 'Move a slice between two vaults once a week and claim any gauge or boost rewards into the same wallet',
    deepen: 'Try the aggregator\'s second product (a leveraged or single-asset vault) with 10-20% of the position to register as a full-product user',
  },
  'Derivatives': {
    open: 'Deposit {pos} of margin to {name} on {chain} and open one small hedged position, long spot against a short perp of the same size',
    weekly: 'Trade 2-3 small positions a week with tight stops, aiming for steady volume and zero liquidations on the wallet\'s record',
    deepen: 'Provide a slice of the margin as liquidity to the counterparty vault if {name} runs one, which earns the house side as well',
  },
  'CDP': {
    open: 'Deposit {pos} of ETH or a liquid staking token as collateral in {name} on {chain} and mint 30-40% of its value in the stablecoin',
    weekly: 'Top up or repay a slice of the debt once a week to keep the collateral ratio above 200%, and use the minted stablecoin inside the app',
    deepen: 'Stake or lend the minted stablecoin in {name}\'s own stability pool, the position CDP protocols track most closely for rewards',
  },
  'RWA': {
    open: 'Mint or buy {pos} of the tokenised real-world asset {name} issues on {chain}, completing its onboarding form first if it asks for one',
    weekly: 'Hold through the weekly yield accrual and claim or compound the distribution once a week into the same asset',
    deepen: 'Redeem a small slice once and re-mint it, so the wallet shows a full round trip rather than a one-way buy',
  },
  'Basis Trading': {
    open: 'Deposit {pos} of USDC into {name} on {chain} to mint its basis or delta-neutral position token, and hold it in the farming wallet',
    weekly: 'Check the funding yield once a week and top up on positive-funding weeks, since deposits in those windows are what basis protocols count',
    deepen: 'Hold through one full funding epoch (usually 30 days) without redeeming, the behaviour basis vaults weight most in their points',
  },
  'Chain': {
    open: 'Bridge {pos} of ETH or USDC to {chain} and make {name}\'s own apps your default for swaps and lending for the season',
    weekly: 'Run 5-8 transactions a week across at least three native apps, and keep a balance above $100 on the chain at all times',
    deepen: 'Deploy or interact with one native flagship app (its own DEX or lending market) and hold any ecosystem NFT or name it issues early',
  },
};

/** The fallback playbook for categories without their own. */
const GENERIC: Playbook = {
  open: 'Deposit {pos} of USDC into {name} on {chain} through its main product and keep the position open in the farming wallet',
  weekly: 'Make one qualifying action a week (a deposit, a withdrawal and re-deposit, or a claim) so the wallet never looks dormant',
  deepen: 'Use the protocol\'s second surface as well (its app, vault or governance page) so the wallet reads as a real user, not a deposit',
};

/** Fill a playbook line with the protocol's own figures. */
function fill(template: string, p: FarmProtocol, pos: string, chainLabel: string): string {
  return template.replaceAll('{pos}', pos).replaceAll('{chain}', chainLabel).replaceAll('{name}', p.name);
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time, derived from the
 * protocol's category, first chain, TVL and age.
 */
export function farmSteps(p: FarmProtocol, ageDays: number | null): FarmStep[] {
  const chain = firstChain(p);
  const gas = gasBand(chain);
  const pos = positionFor(p.tvl_usd);
  const hold = holdDaysFor(ageDays);
  const book = (p.category !== null && PLAYBOOKS[p.category]) || GENERIC;
  return [
    {
      text: `Set up a fresh wallet for this farm, fund it on ${gas.label} with the position plus gas money, and keep its seed phrase offline`,
      cost: `${gas.perTx} for the first transaction on ${gas.label}`,
      time: '10 minutes',
    },
    {
      text: fill(book.open, p, pos.label, gas.label),
      cost: `${pos.label} of capital, ${gas.perTx} a transaction on ${gas.label}`,
      time: '20 minutes to set up',
    },
    {
      text: fill(book.weekly, p, pos.label, gas.label),
      cost: `${gas.perTx} a transaction, roughly $2-$15 a month at one action a week`,
      time: '10 minutes a week',
    },
    {
      text: fill(book.deepen, p, pos.label, gas.label),
      cost: `${gas.perTx} a transaction on ${gas.label}`,
      time: '15 minutes, once',
    },
    {
      text: `Hold the position for at least ${hold} days, then check the protocol's own points or rewards page and claim only from the link it publishes`,
      cost: `the ${pos.label} stays in the position; never pay a fee to claim`,
      time: `${hold} days holding, 10 minutes to check`,
    },
  ];
}
