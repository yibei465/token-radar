# Token Radar

A token launch radar built for make.fun's **token-radar-01** bounty. It reads a sealed snapshot of
the protocol universe (DefiLlama protocols at or above $5M TVL, fetched 2026-11-14) and answers two
questions: which protocols that record no token yet would be worth the most if they launched one, and
what a reader should do to farm each of them before it happens.

## The value model

Implied value is derived only from the snapshot's own figures — no protocol name is ever
special-cased:

```
implied value = TVL × peer multiple × momentum × maturity
```

- **Peer multiple** — for each category, the median market-cap / TVL ratio of the protocols in that
  category whose token already trades (ratios winsorized to [0.02, 3]). A category with at least 3
  traded peers uses its own median; with fewer, the median is shrunk toward the global median:
  `(n · catMedian + 3 · globalMedian) / (n + 3)`.
- **Momentum** — `1 + clamp(change_7d, −40, +80) / 250`; an unreported change counts as 1.0.
- **Maturity** — `0.85 + 0.30 · min(age_years, 4) / 4` from the day DefiLlama began tracking the
  protocol; an unknown listing date counts as 1.0.

The board is the pre-token set: protocols that record no token (no CoinGecko id, no symbol),
excluding wrapped, staked or bridged products of tokens that already trade (the Bridge, Canonical
Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX categories, version-suffixed names,
names carrying the whole words *wrapped*, *staked* or *staking*, and exchange-prefixed names). All
40 watchlist protocols are on the board. The dashboard also carries an estimated airdrop pool per
row — implied value × a per-category community-allocation prior (4–12%) — and a generated farm plan
per protocol: category playbooks priced with the gas band of the protocol's own first chain and a
position sized to its TVL. Token-bearing protocols are shown separately, at the market's own market
cap, and are never ranked by the model.

## Run it

Node 22.18 or later, standard library only:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

This writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's dataset),
`out/dashboard/` (the page), `out/screenshots/` and `out/dossier.json` (written with
`buildDossier` from `vendor/makefun-board.ts`). Open `out/dashboard/index.html` in a browser to use
the radar.

## Dashboard routes

Views are hash-addressable, so any state can be linked or screenshotted by URL alone:

- `#board` — the pre-token board, ranked by implied value.
- `#board?tab=live` — token-live protocols at market value. Filters compose on either tab:
  `cat=<category>`, `chain=<chain>`, `watch=1` (watchlist only), `q=<search>`, `sort=<column>`,
  `dir=asc|desc`.
- `#detail=<slug>` — one protocol's model breakdown and farm plan.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the value model, board construction and snapshot parsing.
- `lib/farm.ts` — the category farm playbooks.
- `dashboard/` — the static page (index.html, app.css, app.js); renders with no network.
- `screenshots/` — the board, a detail view and a filtered view, rendered from the page itself.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte.

## License

MIT — see `LICENSE`.
