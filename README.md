# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yibei465/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yibei465/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the protocol universe (DefiLlama protocols at
or above $5M TVL, fetched 2026-11-14) and answers two questions: which protocols that record no
token yet would be worth the most if they launched one, and what a reader should do to farm each of
them before it happens. The ranked board, the value model and the farm plans are all derived from
the snapshot's own figures — no protocol name is ever special-cased.

## The value model

Implied value is derived only from the snapshot's own figures — no protocol name is ever
special-cased:

```
implied value = TVL × peer multiple × momentum × maturity × propensity
```

- **Peer multiple** — for each category, the median market-cap / TVL ratio of the protocols in that
  category whose token already trades (ratios winsorized to [0.02, 3]). A category with at least 3
  traded peers uses its own median. With fewer, the median is shrunk toward the global median by
  credibility: the traded peers' TVL against the TVL of the category's protocols still waiting for
  a token, `w = peerTVL / (peerTVL + waitingTVL)`. One $12M peer does not price $8B of curators
  (w near 0), while two multi-billion peers do price restaking (w near 1) — the dollars of
  evidence, not the headcount, decide how much of the category's own median survives. A category
  with nothing still waiting for a token keeps none of its own median, whatever its peers say:
  its multiple is the global median. That closes the hole where two observations — one of them at
  the winsor cap — priced a whole category (Token Locker's 1.53×) that no board row ever used.
  The detail view names the traded peers behind each multiple, with their ratios and TVL, so the
  number can be checked against the snapshot.
- **Momentum** — `1 + clamp(change_7d, −40, +80) / 250`; an unreported change counts as 1.0.
- **Maturity** — `0.85 + 0.30 · min(age_years, 4) / 4` from the day DefiLlama began tracking the
  protocol; an unknown listing date counts as 1.0.
- **Propensity** — `0.65 + 0.50 · share`, where *share* is the fraction of the category's protocols
  whose token already trades, shrunk toward the global share the same way:
  `(live + 3 · globalShare) / (total + 3)`. The model's premise is that a token comes one day; in
  categories where tokens are the norm that premise is well supported, and in categories that
  mostly manage other people's assets (risk curators, capital allocators) it is not, so their
  implied values are discounted rather than read as pure TVL.

The board is the pre-token set: protocols that record no token (no CoinGecko id, no symbol),
excluding wrapped, staked or bridged products of tokens that already trade (the Bridge, Canonical
Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX categories, version-suffixed names,
names carrying the whole words *wrapped*, *staked* or *staking*, and exchange-prefixed names). All
40 watchlist protocols are on the board. The dashboard's model panel lists every category's peer
multiple and peer count, read off the same snapshot. The dashboard also carries an estimated
airdrop pool per row — implied value × a per-category community-allocation prior (5–12%) — and a generated farm plan
per protocol: category playbooks priced with the gas band of the protocol's own first chain and a
position sized to its TVL, with the opening step naming the TVL already sitting in the protocol
and the claim step naming the pool the model estimates for it. Token-bearing protocols are shown separately, at the market's own market
cap, and are never ranked by the model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only.

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

---
<sub>Entered on [make.fun](https://make.fun/?ref=53c85n2x&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
