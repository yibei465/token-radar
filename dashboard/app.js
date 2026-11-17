/* Token Radar dashboard: renders window.RADAR (written beside this page by main.ts) with no network.
   Routes live in the hash so every view has a URL: #board, #board?tab=live&cat=Lending&watch=1,
   #detail=<slug>. Sorting and filtering are client-side over the sealed snapshot's data. */
'use strict';

const R = window.RADAR;
const app = document.getElementById('app');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commas = (n) => Math.round(n).toLocaleString('en-US');
function money(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + commas(n);
}
const moneyFull = (n) => (n === null || n === undefined ? '—' : '$' + commas(n));
function pct(n) {
  if (n === null || n === undefined) return '<span class="flat">—</span>';
  const cls = n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
}
const catLabel = (c) => c || 'Uncategorised';
const chainLabel = (chains) => (chains.length === 0 ? '—' : chains.length <= 2 ? chains.join(' · ') : `${chains[0]} +${chains.length - 1}`);

/* ---------- hash routing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('detail=')) return { view: 'detail', slug: decodeURIComponent(h.slice(7)) };
  const q = new URLSearchParams(h.includes('?') ? h.slice(h.indexOf('?') + 1) : '');
  return {
    view: 'board',
    tab: q.get('tab') === 'live' ? 'live' : 'pre',
    cat: q.get('cat') || '',
    chain: q.get('chain') || '',
    watch: q.get('watch') === '1',
    q: q.get('q') || '',
    sort: q.get('sort') || '',
    dir: q.get('dir') || '',
  };
}
function boardHash(s) {
  const q = new URLSearchParams();
  if (s.tab === 'live') q.set('tab', 'live');
  if (s.cat) q.set('cat', s.cat);
  if (s.chain) q.set('chain', s.chain);
  if (s.watch && s.tab === 'pre') q.set('watch', '1');
  if (s.q) q.set('q', s.q);
  if (s.sort) q.set('sort', s.sort);
  if (s.dir) q.set('dir', s.dir);
  const qs = q.toString();
  return '#board' + (qs ? '?' + qs : '');
}
function setHash(h) {
  history.replaceState(null, '', h);
}

/* ---------- masthead ---------- */
function renderChrome() {
  document.getElementById('masthead-meta').innerHTML =
    `<div class="big">Snapshot ${esc(R.as_of)}</div>` +
    `<div>${R.board_size} pre-token ranked · ${R.live_size} token-live</div>` +
    `<div>Watchlist ${R.watchlist_size}/${R.watchlist_size} covered</div>`;
  document.getElementById('model-panel').innerHTML =
    `<div class="model-card"><div><h2>How implied value works</h2>` +
    `<p>Each protocol is priced the way its own category actually trades: the multiple is the median market-cap / TVL of the category's live-token protocols in this snapshot (global median ${R.global_multiple.toFixed(2)}x), nudged by its 7-day TVL momentum and by how long it has run with no token. The est. pool applies a category allocation prior — the share of a launch typically reserved for the community that farmed it.</p>` +
    `<details class="multiples"><summary>Peer multiples by category, from this snapshot</summary><div class="mult-grid">` +
    R.category_multiples.map((c) => `<span>${esc(c.category)} <b>×${c.multiple.toFixed(2)}</b> <i>(${c.peers} peer${c.peers === 1 ? '' : 's'})</i></span>`).join('') +
    `</div></details></div>` +
    `<div class="formula"><b>implied</b> <span class="op">=</span> TVL <span class="op">×</span> <b>peer multiple</b> <span class="op">×</span> <b>momentum</b> <span class="op">×</span> <b>maturity</b></div></div>`;
  document.getElementById('foot').textContent =
    `Data: ${R.source}. Implied values are this radar's own model estimates (model ${R.model_version}), not predictions that a token will launch. A protocol listed here records no token in the snapshot; that is DefiLlama's record, not proof none exists.`;
}

/* ---------- board ---------- */
const PRE_COLS = [
  ['rank', '#', 'num'], ['name', 'Protocol', ''], ['tvl', 'TVL', 'right num'], ['change', '7d', 'right num'],
  ['implied', 'Implied value', 'right num'], ['pool', 'Est. pool', 'right num'],
];
const LIVE_COLS = [
  ['name', 'Protocol', ''], ['tvl', 'TVL', 'right num'], ['change', '7d', 'right num'], ['mcap', 'Market cap', 'right num'],
];
let state = null;

function options(values, current, allLabel) {
  return `<option value="">${allLabel}</option>` + values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function renderBoard(s) {
  document.body.classList.remove('is-detail');
  state = s;
  const rows = s.tab === 'live' ? R.live : R.rows;
  const cats = [...new Set(rows.map((r) => catLabel(r.category)))].sort();
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  const cols = s.tab === 'live' ? LIVE_COLS : PRE_COLS;
  app.innerHTML =
    `<div class="tabs" role="tablist">` +
    `<button class="tab" role="tab" data-tab="pre" aria-selected="${s.tab === 'pre'}">Pre-token board<span class="count">${R.board_size}</span></button>` +
    `<button class="tab" role="tab" data-tab="live" aria-selected="${s.tab === 'live'}">Token-live<span class="count">${R.live_size}</span></button></div>` +
    `<div class="controls">` +
    `<input type="search" id="f-q" placeholder="Search protocols…" value="${esc(s.q)}" aria-label="Search protocols">` +
    `<select id="f-cat" aria-label="Filter by category">${options(cats, s.cat, 'All categories')}</select>` +
    `<select id="f-chain" aria-label="Filter by chain">${options(chains, s.chain, 'All chains')}</select>` +
    (s.tab === 'pre' ? `<label class="check"><input type="checkbox" id="f-watch"${s.watch ? ' checked' : ''}> Watchlist only</label>` : '') +
    `<span class="result-count" id="count"></span></div>` +
    (s.tab === 'live'
      ? `<p class="note"><b>Already trading.</b> These protocols have a token in the snapshot, so the radar does not rank them — it shows the market's own market cap. The pre-token board is where the launches have not happened yet.</p>`
      : `<p class="note">Ranked by implied value under the model above. <b>Watchlist</b> rows are the snapshot's ${R.watchlist_size} largest pre-token protocols (TVL at or above ${money(R.floor_usd)}); the rest are the early finds below that floor. Click any row for its model breakdown and farm plan.</p>`) +
    `<table class="board"><thead><tr>${cols.map(([k, label, cls]) => `<th class="${cls}" data-sort="${k}">${label}${sortMark(s, k)}</th>`).join('')}</tr></thead><tbody id="tbody"></tbody></table>`;
  wireBoard();
  updateTable();
}

function sortMark(s, key) {
  const active = (s.sort || (s.tab === 'live' ? 'mcap' : 'rank')) === key;
  if (!active) return '';
  const dir = s.dir || (key === 'rank' || key === 'name' ? 'asc' : 'desc');
  return `<span class="dir">${dir === 'asc' ? '▲' : '▼'}</span>`;
}

function filteredRows(s) {
  let rows = s.tab === 'live' ? [...R.live] : [...R.rows];
  if (s.cat) rows = rows.filter((r) => catLabel(r.category) === s.cat);
  if (s.chain) rows = rows.filter((r) => r.chains.includes(s.chain));
  if (s.tab === 'pre' && s.watch) rows = rows.filter((r) => r.watchlist);
  if (s.q) {
    const needle = s.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.includes(needle));
  }
  const key = s.sort || (s.tab === 'live' ? 'mcap' : 'rank');
  const dir = (s.dir || (key === 'rank' || key === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  const val = (r) => ({ rank: r.rank, name: r.name.toLowerCase(), tvl: r.tvl_usd, change: r.change_7d ?? -1e9, implied: r.implied_value_usd, pool: r.pool_usd, mcap: r.mcap_usd ?? -1 }[key]);
  rows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  return rows;
}

function updateTable() {
  const s = state;
  const rows = filteredRows(s);
  const tbody = document.getElementById('tbody');
  document.getElementById('count').textContent = `${rows.length} protocol${rows.length === 1 ? '' : 's'}`;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No protocols match these filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r) => s.tab === 'live'
    ? `<tr data-slug="${esc(r.slug)}"><td><div class="proto-name">${esc(r.name)}<span class="chip chip-live">${esc(r.symbol || 'live')}</span></div><div class="proto-sub">${esc(catLabel(r.category))} · ${esc(chainLabel(r.chains))}</div></td>` +
      `<td class="right num">${money(r.tvl_usd)}</td><td class="right num">${pct(r.change_7d)}</td><td class="right num value">${money(r.mcap_usd)}</td></tr>`
    : `<tr data-slug="${esc(r.slug)}" tabindex="0"><td class="rank">${r.rank}</td><td><div class="proto-name">${esc(r.name)}${r.watchlist ? '<span class="chip chip-watch">Watchlist</span>' : ''}</div><div class="proto-sub">${esc(catLabel(r.category))} · ${esc(chainLabel(r.chains))}</div></td>` +
      `<td class="right num">${money(r.tvl_usd)}</td><td class="right num">${pct(r.change_7d)}</td><td class="right num value">${money(r.implied_value_usd)}</td><td class="right num pool">${money(r.pool_usd)}</td></tr>`
  ).join('');
}

function wireBoard() {
  const s = state;
  const push = () => setHash(boardHash(s));
  app.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { s.tab = b.dataset.tab; s.sort = ''; s.dir = ''; push(); renderBoard(s); }));
  document.getElementById('f-q').addEventListener('input', (e) => { s.q = e.target.value; push(); updateTable(); });
  document.getElementById('f-cat').addEventListener('change', (e) => { s.cat = e.target.value; push(); updateTable(); });
  document.getElementById('f-chain').addEventListener('change', (e) => { s.chain = e.target.value; push(); updateTable(); });
  const watch = document.getElementById('f-watch');
  if (watch) watch.addEventListener('change', (e) => { s.watch = e.target.checked; push(); updateTable(); });
  app.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (s.sort === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
    else { s.sort = key; s.dir = key === 'rank' || key === 'name' ? 'asc' : 'desc'; }
    push(); renderBoard(s);
  }));
  const tbody = document.getElementById('tbody');
  const open = (tr) => { if (tr && state.tab === 'pre') location.hash = '#detail=' + encodeURIComponent(tr.dataset.slug); };
  tbody.addEventListener('click', (e) => open(e.target.closest('tr[data-slug]')));
  tbody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') open(e.target.closest('tr[data-slug]'));
  });
}

/* ---------- detail ---------- */
function barWidth(kind, v, row) {
  if (kind === 'base') return Math.max(3, Math.min(100, (row.tvl_usd / row.implied_value_usd) * 100));
  if (kind === 'multiple') return Math.max(3, Math.min(100, (v / 3) * 100));
  if (kind === 'momentum') return Math.max(3, Math.min(100, ((v - 0.8) / 0.6) * 100));
  return Math.max(3, Math.min(100, ((v - 0.85) / 0.3) * 100));
}
/** How a category's multiple was earned: its own median, a shrunk median, or the global fallback. */
function peerExplain(m, category) {
  if (m.peers >= 3) return `median of ${m.peers} live-token ${category} peers in this snapshot`;
  if (m.peers >= 1) return `only ${m.peers} live-token ${category} peer${m.peers === 1 ? '' : 's'} — shrunk toward the global median`;
  return `no live-token ${category} peers — the global median multiple`;
}
function factorRow(label, explain, kind, v, shown, row) {
  return `<div class="factor"><div class="fk">${label}<br><span style="color:var(--faint);font-size:12px">${explain}</span></div><div class="bar"><i style="width:${barWidth(kind, v, row).toFixed(1)}%"></i></div><div class="fv">${shown}</div></div>`;
}
function renderDetail(slug) {
  document.body.classList.add('is-detail');
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) { renderBoard({ view: 'board', tab: 'pre', cat: '', chain: '', watch: false, q: '', sort: '', dir: '' }); return; }
  const m = r.model;
  const ageTxt = r.age_days === null ? 'not recorded' : `${commas(r.age_days)} days`;
  app.innerHTML =
    `<a class="back" href="#board">← Back to the board</a>` +
    `<div class="detail-head"><h2>${esc(r.name)}</h2><span class="sub">${esc(catLabel(r.category))} · ${esc(r.chains.join(', ') || '—')} · rank #${r.rank} of ${R.board_size}${r.watchlist ? ' · on the watchlist' : ''}</span></div>` +
    `<div class="stat-grid">` +
    `<div class="stat"><div class="k">Implied value</div><div class="v amber">${moneyFull(r.implied_value_usd)}</div><div class="s">under the model, if its record held</div></div>` +
    `<div class="stat"><div class="k">Est. airdrop pool</div><div class="v">${moneyFull(r.pool_usd)}</div><div class="s">${(m.allocation_prior * 100).toFixed(0)}% community allocation prior</div></div>` +
    `<div class="stat"><div class="k">TVL</div><div class="v">${moneyFull(r.tvl_usd)}</div><div class="s">7d change ${r.change_7d === null ? 'not recorded' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</div></div>` +
    `<div class="stat"><div class="k">Running with no token</div><div class="v">${ageTxt}</div><div class="s">tracked since ${esc(r.listed_at || '—')}</div></div></div>` +
    `<section class="panel"><h3>How this value is built</h3>` +
    factorRow('TVL base', `${moneyFull(r.tvl_usd)} locked in the protocol`, 'base', 0, moneyFull(r.tvl_usd), r) +
    factorRow('Peer multiple', esc(peerExplain(m, catLabel(r.category))), 'multiple', m.multiple, '× ' + m.multiple.toFixed(2), r) +
    factorRow('Momentum', 'its 7-day TVL change, damped', 'momentum', m.momentum, '× ' + m.momentum.toFixed(2), r) +
    factorRow('Maturity', 'how long it has run with no token', 'maturity', m.maturity, '× ' + m.maturity.toFixed(2), r) +
    `<div class="factor-total"><span>Implied value</span><span class="tv">${moneyFull(r.implied_value_usd)}</span></div></section>` +
    `<section class="panel"><h3>Farm plan — what to do before it launches</h3><ol class="plan">` +
    r.farm_steps.map((st) => `<li><span class="n"></span><div><div class="step-text">${esc(st.text)}</div><div class="step-chips"><span>Cost <b>${esc(st.cost)}</b></span><span>Time <b>${esc(st.time)}</b></span></div></div></li>`).join('') +
    `</ol></section>`;
  window.scrollTo(0, 0);
}

/* ---------- go ---------- */
function render() {
  const s = parseHash();
  app.setAttribute('aria-busy', 'false');
  if (s.view === 'detail') renderDetail(s.slug);
  else renderBoard(s);
}
window.addEventListener('hashchange', render);
renderChrome();
render();
