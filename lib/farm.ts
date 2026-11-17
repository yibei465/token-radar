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
  /** What one qualifying action a week adds up to over a month, in the same band. */
  monthly: string;
}

const L2_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Linea', 'Scroll', 'zkSync Era', 'Mantle', 'Mode', 'Blast',
  'Taiko', 'Unichain', 'Ink', 'Soneium', 'Katana', 'Abstract', 'Bob', 'World Chain', 'Zora',
]);

/** The gas band of a chain: Ethereum is dear, Solana is dust, L2s sit between, other L1s below them. */
export function gasBand(chain: string | null): GasBand {
  if (chain === 'Ethereum') return { label: 'Ethereum mainnet', perTx: '$5-$25', monthly: '$20-$100 a month' };
  if (chain === 'Solana') return { label: 'Solana', perTx: '$0.01-$0.10', monthly: 'under $0.50 a month' };
  if (chain !== null && L2_CHAINS.has(chain)) return { label: chain, perTx: '$0.10-$2', monthly: '$0.40-$8 a month' };
  if (chain === 'Bitcoin') return { label: 'Bitcoin', perTx: '$1-$5', monthly: '$4-$20 a month' };
  return { label: chain ?? 'its main chain', perTx: '$0.05-$1.50', monthly: '$0.20-$6 a month' };
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
  'Prediction Market': {
    open: 'Fund {pos} on {name} on {chain} and take small positions in 3-4 of its most liquid markets, on both sides across the week',
    weekly: 'Trade 2-3 markets a week and provide a quote or two of liquidity where the book is thin, keeping total exposure under the funded amount',
    deepen: 'Hold one position to settlement and claim the payout, since settled-and-claimed wallets are the ones prediction markets can verify',
  },
  'Insurance': {
    open: 'Buy {pos} of cover from {name} on {chain} against a protocol you actually use, for the longest term it offers (usually 90-180 days)',
    weekly: 'Check the cover weekly and renew or extend it before it lapses, so the wallet shows continuous cover rather than a single purchase',
    deepen: 'Stake a smaller slice into the underwriting pool if {name} runs one, which is the side of insurance protocols that earns the rewards',
  },
  'Staking Pool': {
    open: 'Stake {pos} of the chain\'s native asset through {name} on {chain} and keep the staking receipt in the farming wallet',
    weekly: 'Claim and restake the staking rewards once a week, and add a small top-up so the staked balance trends upward',
    deepen: 'Split the stake across two validators or pools if {name} offers a choice, which pools read as deliberate delegation, not a default',
  },
  'Restaking': {
    open: 'Restake {pos} of a liquid staking token through {name} on {chain} and hold the restaking receipt where its points page reads it',
    weekly: 'Claim any operator or AVS rewards weekly and restake them, and avoid withdrawing inside the unbonding window unless you mean to exit',
    deepen: 'Delegate a slice to a second operator if the app allows it, since diversified delegation is what restaking points usually weight',
  },
  'Leveraged Farming': {
    open: 'Open a {pos} leveraged position in {name}\'s most liquid pair on {chain} at 2-3x, never at the maximum the slider offers',
    weekly: 'Rebalance the leverage once a week to hold it near its starting level, and keep a $50-$100 reserve in the wallet for top-ups',
    deepen: 'Run a second, smaller position in a different pair so the wallet shows range, and close one position fully once to record a realised cycle',
  },
  'Liquidity Manager': {
    open: 'Deposit {pos} into an actively managed liquidity vault of {name} on {chain}, choosing the pair you would hold unlevered anyway',
    weekly: 'Check the vault\'s range weekly and claim and re-deposit fees, moving vaults only when one drifts out of range for days',
    deepen: 'Hold shares in two vaults of different pairs, which managers read as real allocation rather than a parked test deposit',
  },
  'Uncollateralized Lending': {
    open: 'Lend {pos} into a pool of {name} on {chain} with the shortest lock-up first, after reading the pool\'s borrower and default terms',
    weekly: 'Roll the loan at each maturity instead of withdrawing, and diversify into a second pool once the first pays out on time',
    deepen: 'Complete any lender profile or accreditation step the app offers, since verified lenders are the cohort these protocols can reward',
  },
  'Interest Rate Derivatives': {
    open: 'Buy {pos} of the fixed-rate side (or sell the floating side) of the nearest expiry on {name} on {chain}',
    weekly: 'Roll the position at expiry into the next term, and take the opposite side once with a small amount to show two-sided use',
    deepen: 'Provide liquidity to the rate market itself if {name} runs an AMM for it, which is where its points and fees concentrate',
  },
  'CDP Manager': {
    open: 'Open a vault in {name} on {chain} with {pos} of collateral and mint 30-40% of its value, keeping the ratio above 200%',
    weekly: 'Service the vault weekly: top up, repay or re-mint a slice, and use the manager\'s automation (stop-loss or auto-repay) if it offers it',
    deepen: 'Run a second vault on a different collateral type, which CDP managers count as a power user rather than a single position',
  },
  'Anchor BTC': {
    open: 'Deposit {pos} of BTC (or its wrapped form) into {name} on {chain} and mint or hold its BTC-backed asset in the farming wallet',
    weekly: 'Claim the yield weekly and re-deposit it, keeping the position whole through at least one full distribution cycle',
    deepen: 'Redeem a small slice once and deposit again, so the wallet records a full round trip of the BTC product',
  },
  'Decentralized BTC': {
    open: 'Bridge {pos} of BTC into {name} on {chain} through its own bridge flow, in one deposit rather than several test-sized ones',
    weekly: 'Use the bridged BTC once a week inside the destination app (a swap, a supply or a stake) so the balance is active, not parked',
    deepen: 'Hold through one bridge epoch or checkpoint, the window decentralised BTC networks usually snapshot for their distributions',
  },
  'Dual-Token Stablecoin': {
    open: 'Mint {pos} of the stablecoin through {name} on {chain} with its volatile counterpart asset, and hold both sides of the pair',
    weekly: 'Stake or lock the governance-side token if the app offers it, and rebalance the pair weekly as prices move',
    deepen: 'Provide liquidity to the stablecoin\'s main pool with 20-30% of the position, the deepest signal a dual-token system tracks',
  },
  'Stablecoin Wrapper': {
    open: 'Wrap {pos} of the underlying stablecoin through {name} on {chain} and hold the wrapped, yield-bearing version',
    weekly: 'Let the yield accrue and claim or compound it weekly, topping up on the same day each week to build a clean history',
    deepen: 'Use the wrapped token as collateral or liquidity in one partner app the wrapper lists, which is the usage it is designed to reward',
  },
  'CeDeFi': {
    open: 'Deposit {pos} into the flagship earn product of {name} on {chain}, completing its account verification first if it asks',
    weekly: 'Claim the weekly yield into the same product and keep the balance above the tier threshold the product publishes',
    deepen: 'Try a second product (a fixed-term or structured vault) with 15-20% of the position to count as a multi-product customer',
  },
  'OTC Marketplace': {
    open: 'Complete {name}\'s onboarding on {chain} and post or take one small order of {pos}, settling it fully on-platform',
    weekly: 'Take or make one order a week at fair prices, keeping every settlement on-platform so the trade history is verifiable',
    deepen: 'Trade a second asset class the marketplace lists (points, vesting or NFT orders), which marketplaces weight as real flow',
  },
  'Payments': {
    open: 'Fund {pos} on {name} on {chain} and route one real payment (to your own second wallet or a merchant it lists) through it',
    weekly: 'Make 2-3 small payments a week and keep a standing balance, since payment apps reward transaction count and retained balances',
    deepen: 'Turn on the app\'s card or off-ramp feature if offered and use it once, the activation step payment launches usually gate on',
  },
  'Crypto Card Issuer': {
    open: 'Order or activate the card from {name}, load {pos} onto it on {chain}, and make it your card for small everyday spends',
    weekly: 'Run 5-10 small card transactions a week and top the balance up before it empties, keeping the account in its active tier',
    deepen: 'Hold the issuer\'s required stake or tier balance if it publishes one, since card programmes snapshot tiers for their launches',
  },
  'Governance Incentives': {
    open: 'Acquire and lock {pos} of the position {name} incentivises on {chain}, then delegate or vote with it in the current round',
    weekly: 'Vote in every proposal of the round and claim the incentive weekly, re-locking it so the voting weight compounds',
    deepen: 'Write one substantive comment or rationale in the governance forum, the off-chain activity incentive programmes also score',
  },
  'Indexes': {
    open: 'Mint {pos} of the flagship index token of {name} on {chain} and hold it unhedged in the farming wallet',
    weekly: 'Top up at each rebalance (usually monthly, check weekly) so the wallet\'s index balance grows with the basket',
    deepen: 'Redeem a small slice once and re-mint it, and hold a second index of a different theme if the issuer offers one',
  },
  'Collateral Markets': {
    open: 'Post {pos} of collateral into {name} on {chain} and take the small, fully-backed position its market is built around',
    weekly: 'Roll or resize the position weekly and keep the collateral ratio in the market\'s safest band at all times',
    deepen: 'Post a second collateral type if the market accepts one, which marks the wallet as a market maker-grade user',
  },
  'Farm': {
    open: 'Stake {pos} in the highest-TVL farm of {name} on {chain}, in the pool whose reward asset you would hold anyway',
    weekly: 'Harvest once a week and restake half the rewards into the same pool, selling none of it in the first month',
    deepen: 'Enter a second farm with a different pair so the wallet is not a single-pool mercenary, and hold both through a reward epoch',
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
      cost: `${gas.perTx} a transaction, ${gas.monthly} at one action a week`,
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
