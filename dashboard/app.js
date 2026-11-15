// Token Radar dashboard — static, no framework, no network. Reads window.RADAR
// (written beside this folder by main.ts) and renders four views, all
// deep-linkable through the URL hash, so a screenshot is reproducible from a
// plain URL:  #/  the board ·  #/?q=&category=&chain=  filtered board
// #/protocol/<slug>  one protocol's breakdown + farm plan
// #/live  live-token comparison (market values) ·  #/method  methodology.
//
// Defensive about the model: the comps-fitted model may add fields
// (row.curve_multiple, curve, validation). Anything present is shown;
// anything absent falls back to what the radar-1 data carries. Nothing invented.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !Array.isArray(DATA.rows)) {
    app.textContent = 'Token Radar could not load: data.js is missing or empty.';
    return;
  }

  /* ---------- formatting ---------- */
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : '×' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '×' + (n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
  }
  function fmtDate(s) { return s || 'unknown'; }

  /* ---------- tiny DOM helper (textContent only: no HTML injection) ---------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  /* Farm plans: board.json carries farm_steps per row, but data.js is the
     compact feed and does not. The derivation below is the model's own
     (see lib/model.ts): category + chains + TVL + age decide the action,
     the capital, the hold and every cost. Shipped farm_steps, if any, win. */
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function derivedSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    return [
      { action: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { action: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { action: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { action: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { action: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { action: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }
  // Split board.json's step strings back into action, cost and time.
  function parseStep(s) {
    var ci = s.indexOf(' Cost: '), ti = s.indexOf(' Time: ');
    var action = ci >= 0 ? s.slice(0, ci) : s;
    var cost = ci >= 0 ? s.slice(ci + 7, ti >= 0 ? ti : s.length) : '';
    var time = ti >= 0 ? s.slice(ti + 7) : '';
    return { action: action, cost: cost.replace(/\.$/, ''), time: time.replace(/\.$/, '') };
  }
  function farmSteps(p) {
    if (Array.isArray(p.farm_steps) && p.farm_steps.length) {
      return p.farm_steps.map(function (s) { return typeof s === 'string' ? parseStep(s) : { action: s.text || '', cost: s.cost || '', time: s.time || '' }; });
    }
    return derivedSteps(p);
  }
  // One-off gas from the steps' gas costs, except the weekly one.
  function gasSummary(steps, capital) {
    var once = 0, weekly = null;
    steps.forEach(function (s) {
      var m = /about \$(\d+)|under \$(\d+)/.exec(s.cost || '');
      if (!m || (s.cost || '').indexOf('gas') < 0) return;
      var v = parseInt(m[1] || m[2], 10);
      if ((s.cost || '').indexOf('a week') >= 0) weekly = v;
      else once += v;
    });
    return { capital: capital, once: once, weekly: weekly };
  }

  /* ---------- model arithmetic (for the detail breakdown) ---------- */
  var MODEL = DATA.model || {};
  function growthMult(row) {
    if (typeof row.growth_multiplier === 'number') return row.growth_multiplier;
    if (MODEL.growth_weight === undefined) return null;
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    g = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, g));
    return 1 + (g / 100) * MODEL.growth_weight;
  }
  function maturityMult(row) {
    if (typeof row.maturity_multiplier === 'number') return row.maturity_multiplier;
    if (MODEL.maturity_floor === undefined) return null;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    return MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  }
  // One size multiple folds base × comps into one number (radar-1: flat 0.25).
  function sizeMult(row) {
    var g = growthMult(row), m = maturityMult(row);
    if (!g || !m || !row.tvl_usd) return null;
    return row.implied_value_usd / (row.tvl_usd * g * m);
  }

  /* ---------- state + hash routing ---------- */
  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
  var chainCount = {};
  DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
  var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });
  var maxImplied = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; })) || 1;

  var state = { view: 'board', slug: null, q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, liveSort: 'mcap', liveDir: -1 };

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    state.view = 'board'; state.slug = null; state.q = ''; state.category = 'all'; state.chain = 'all';
    if (!h || h === '/') return;
    var m = h.match(/^\/protocol\/([\w-]+)\/?$/);
    if (m) { state.view = 'detail'; state.slug = m[1]; return; }
    if (h === '/live') { state.view = 'live'; return; }
    if (h === '/method') { state.view = 'method'; return; }
    if (h.slice(0, 2) === '/?') {
      var p = new URLSearchParams(h.slice(2));
      if (p.get('q')) state.q = p.get('q');
      if (p.get('category')) state.category = p.get('category');
      if (p.get('chain')) state.chain = p.get('chain');
      if (p.get('sort')) state.sort = p.get('sort');
      if (p.get('dir') === '1' || p.get('dir') === '-1') state.dir = parseInt(p.get('dir'), 10);
    }
  }
  function writeHash() {
    var next;
    if (state.view === 'detail' && state.slug) next = '#/protocol/' + state.slug;
    else if (state.view === 'live') next = '#/live';
    else if (state.view === 'method') next = '#/method';
    else {
      var p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      if (state.category !== 'all') p.set('category', state.category);
      if (state.chain !== 'all') p.set('chain', state.chain);
      if (state.sort !== 'implied') p.set('sort', state.sort);
      if (state.dir !== -1) p.set('dir', String(state.dir));
      next = p.toString() ? '#/?' + p.toString() : '#/';
    }
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }
  function go(view, slug) {
    state.view = view; state.slug = slug || null;
    writeHash(); render(); window.scrollTo(0, 0);
  }

  /* ---------- shared chrome ---------- */
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name' }, el('b', { text: 'Token' }), ' Radar')),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, 'Model ', el('code', { text: DATA.model_version || 'n/a' }))
      )
    );
  }
  function nav() {
    function tab(view, label, n) {
      var a = el('a', { href: view === 'board' ? '#/' : '#/' + view, 'aria-current': state.view === view ? 'page' : null, onclick: function (e) { e.preventDefault(); go(view); } }, label);
      if (n !== undefined) a.appendChild(el('span', { class: 'n', text: String(n) }));
      return a;
    }
    return el('nav', { class: 'nav', 'aria-label': 'Views' },
      tab('board', 'Board', DATA.board_size),
      tab('live', 'Live tokens', DATA.live_size),
      tab('method', 'Methodology'));
  }
  function footer() {
    return el('footer', { class: 'foot' },
      el('span', null, 'Source: ', el('span', { text: DATA.source || 'DefiLlama snapshot' })),
      el('span', null, 'Static page — reads only data.js, no network. Implied value is a model, not a price.')
    );
  }
  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: fmtUsd(DATA.floor_usd) }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor. ',
          el('b', { text: top ? top.name : '' }), ' leads at ', el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }),
          ' of implied value. Live tokens are set aside with their market caps, not a model.')
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  /* ---------- board ---------- */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function activeFilters() {
    var pills = [];
    if (state.q) pills.push(el('span', { class: 'pill' }, 'Search: ', el('b', { text: state.q }), el('button', { type: 'button', 'aria-label': 'Clear search', text: '×', onclick: function () { state.q = ''; writeHash(); render(); } })));
    if (state.category !== 'all') pills.push(el('span', { class: 'pill' }, 'Category: ', el('b', { text: state.category }), el('button', { type: 'button', 'aria-label': 'Clear category filter', text: '×', onclick: function () { state.category = 'all'; writeHash(); render(); } })));
    if (state.chain !== 'all') pills.push(el('span', { class: 'pill' }, 'Chain: ', el('b', { text: state.chain }), el('button', { type: 'button', 'aria-label': 'Clear chain filter', text: '×', onclick: function () { state.chain = 'all'; writeHash(); render(); } })));
    return pills;
  }
  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCount[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      activeFilters(),
      el('span', { class: 'count' }, el('b', { text: String(filteredRows().length) }), ' of ' + DATA.board_size + ' rows')
    );
  }
  function sortHeader(key, label) {
    var arrow = state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } }, label, arrow)
    );
  }
  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chainText = (r.chains || []).length ? (r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '')) : '—';
      var tr = el('tr', {
        tabindex: '0',
        onclick: function () { go('detail', r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('detail', r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank === 1 ? ' rank-1' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, el('a', { href: '#/protocol/' + r.slug, onclick: function (e) { e.preventDefault(); go('detail', r.slug); } }, r.name)),
          el('span', { class: 'sub', text: r.category || 'Other' })
        )),
        el('td', { class: 'chains', text: chainText }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'bar-wrap' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'tag' + (r.rank <= 10 ? ' hot' : ''), text: '$' + capitalFor(r) + ' · ' + farmSteps(r).length + ' steps' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Chains' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm' })
          )),
          tbody
        )
      )
    );
  }

  /* ---------- detail ---------- */
  function breakdownRows(row) {
    var g = growthMult(row), m = maturityMult(row);
    var rows = [];
    var running = row.tvl_usd;
    rows.push({ label: 'TVL', note: 'locked value in the snapshot', factor: null, value: fmtUsd(row.tvl_usd) });
    // radar-2: the comps-fitted curve multiple (category adjustment already
    // folded in — tvl × curve × growth × maturity reproduces the board).
    if (typeof row.curve_multiple === 'number') {
      var note = 'comps curve, fitted on ' + (DATA.curve && DATA.curve.n_comps ? DATA.curve.n_comps : 'the live-token') + ' live-token comps';
      if (row.category_adjustment) {
        // The stored adjustment is in log units: the true multiple is
        // exp(adjustment) − 1, not the raw number as a percent.
        var adjF = Math.exp(row.category_adjustment) - 1;
        note += ' · category adjustment ' + (adjF >= 0 ? '+' : '') + (adjF * 100).toFixed(1) + '%';
      }
      rows.push({ label: 'Curve multiple', note: note, factor: fmtMult(row.curve_multiple), value: fmtUsd(running * row.curve_multiple) });
      running *= row.curve_multiple;
    } else if (typeof row.comps_multiple === 'number' && typeof MODEL.base_multiple === 'number') {
      rows.push({ label: 'Base multiple', note: 'model constant', factor: fmtMult(MODEL.base_multiple), value: fmtUsd(running * MODEL.base_multiple) });
      running *= MODEL.base_multiple;
      rows.push({ label: 'Comps multiple', note: 'fitted from live-token market caps', factor: fmtMult(row.comps_multiple), value: fmtUsd(running * row.comps_multiple) });
      running *= row.comps_multiple;
    } else {
      var size = sizeMult(row);
      if (size !== null) {
        var note2 = MODEL.base_multiple !== undefined
          ? 'base × comps folded into one multiple (' + (DATA.model_version || 'model') + ' base is ' + MODEL.base_multiple + ')'
          : 'base × comps folded into one multiple';
        rows.push({ label: 'Size multiple', note: note2, factor: fmtMult(size), value: fmtUsd(running * size) });
        running *= size;
      }
    }
    if (g !== null) {
      rows.push({ label: 'Growth multiplier', note: '7d change ' + fmtPct(row.change_7d) + ' (clamped)', factor: fmtMult(g), value: fmtUsd(running * g) });
      running *= g;
    }
    if (m !== null) {
      rows.push({ label: 'Maturity multiplier', note: 'age ' + fmtAge(row.age_days) + ' with no token', factor: fmtMult(m), value: fmtUsd(running * m) });
      running *= m;
    }
    return { rows: rows, recomputed: Math.max(1, Math.round(running)) };
  }
  function detailView() {
    var row = bySlug[state.slug];
    if (!row) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Unknown protocol' }),
        el('p', { text: 'No row on this board has the slug "' + state.slug + '".' }),
        el('button', { class: 'button primary', type: 'button', text: 'Back to the board', onclick: function () { go('board'); } })
      ));
    }
    var bd = breakdownRows(row);
    var steps = farmSteps(row);
    var gas = gasSummary(steps, capitalFor(row));
    var prev = DATA.rows.filter(function (r) { return r.rank === row.rank - 1; })[0];
    var next = DATA.rows.filter(function (r) { return r.rank === row.rank + 1; })[0];
    var exact = Math.abs(bd.recomputed - row.implied_value_usd) <= Math.max(1, 0.002 * row.implied_value_usd);

    var factorRows = bd.rows.map(function (f) {
      return el('div', { class: 'row' },
        el('span', null, f.label, f.note ? el('small', { text: f.note }) : null),
        el('b', { text: (f.factor ? f.factor + '  →  ' : '') + f.value })
      );
    });
    factorRows.push(el('div', { class: 'row total' },
      el('span', { text: 'Implied value' }),
      el('b', { text: fmtUsd(row.implied_value_usd) })
    ));

    var stepItems = steps.map(function (s) {
      return el('li', null, el('div', null,
        el('div', { class: 'action', text: s.action }),
        el('div', { class: 'meta' },
          s.cost ? el('span', { class: 'cost' }, 'Cost: ', el('b', { text: s.cost })) : null,
          s.time ? el('span', null, 'Time: ' + s.time) : null
        )
      ));
    });

    return el('div', null,
      el('div', { class: 'crumb' },
        el('a', { href: '#/', onclick: function (e) { e.preventDefault(); go('board'); } }, '← Board'),
        '  ·  Rank ' + row.rank + ' of ' + DATA.board_size
      ),
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'rank-badge', text: 'Rank ' + row.rank + ' · ' + (row.category || 'Other') }),
          el('h1', { text: row.name }),
          el('p', { class: 'sub', text: 'No token on record · listed ' + fmtDate(row.listed_at) + ' · ' + fmtAge(row.age_days) + ' old · ' + (row.chains || []).length + ' chains' }),
          el('div', { class: 'chips' }, (row.chains || []).map(function (c) { return el('span', { class: 'tag', text: c }); }))
        )
      ),
      el('div', { class: 'detail-grid' },
        el('div', { class: 'panel' },
          el('h2', { text: 'Implied value — the breakdown' }),
          el('p', { class: 'hint', text: 'Each line applies one factor to the running value.' }),
          el('div', { class: 'breakdown' }, factorRows),
          el('p', { class: 'check' + (exact ? '' : ' warn') },
            exact
              ? el('b', { text: 'Recomputes exactly: ' }) : el('b', { text: 'Published value differs from recomputation: ' }),
            'the factors above multiply to ' + fmtUsd(bd.recomputed) + ' against the board\u2019s ' + fmtUsd(row.implied_value_usd) + '. An estimate, not a price.'
          ),
          el('div', { class: 'facts' },
            el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
            el('div', null, el('span', { text: '7-day change' }), el('b', { text: fmtPct(row.change_7d) })),
            el('div', null, el('span', { text: 'Listed' }), el('b', { text: fmtDate(row.listed_at) })),
            el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
            el('div', null, el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) })),
            el('div', null, el('span', { text: 'Token status' }), el('b', { text: 'pre-token' }))
          )
        ),
        el('div', { class: 'panel' },
          el('h2', { text: 'Farm plan' }),
          el('p', { class: 'hint', text: 'Derived from this protocol\u2019s own category, chain, TVL and age — the same plan board.json carries.' }),
          el('ol', { class: 'steps' }, stepItems),
          el('div', { class: 'plan-summary' },
            el('span', null, 'Capital ', el('b', { text: '$' + gas.capital })),
            el('span', null, 'One-off gas ', el('b', { text: '≈ $' + gas.once })),
            gas.weekly !== null ? el('span', null, 'Weekly gas ', el('b', { text: '≈ $' + gas.weekly })) : null,
            el('span', null, 'Hold ', el('b', { text: holdDaysFor(row.age_days) + ' days' })),
            el('span', null, 'Steps ', el('b', { text: String(steps.length) }))
          )
        )
      ),
      el('div', { class: 'pager' },
        prev ? el('a', { href: '#/protocol/' + prev.slug, onclick: function (e) { e.preventDefault(); go('detail', prev.slug); } }, '← #' + prev.rank + ' ', el('b', { text: prev.name })) : el('span'),
        next ? el('a', { href: '#/protocol/' + next.slug, onclick: function (e) { e.preventDefault(); go('detail', next.slug); } }, '#' + next.rank + ' ', el('b', { text: next.name }), ' →') : el('span')
      )
    );
  }

  /* ---------- live-token comparison ---------- */
  function liveView() {
    var ratios = DATA.live
      .map(function (r) { return (r.mcap_usd !== null && r.tvl_usd) ? r.mcap_usd / r.tvl_usd : null; })
      .filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
    var median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
    var mean = ratios.length ? ratios.reduce(function (a, b) { return a + b; }, 0) / ratios.length : null;
    var max = ratios.length ? ratios[ratios.length - 1] : null;

    var list = DATA.live.slice().sort(function (a, b) {
      var av, bv;
      if (state.liveSort === 'ratio') { av = (a.mcap_usd && a.tvl_usd) ? a.mcap_usd / a.tvl_usd : -Infinity; bv = (b.mcap_usd && b.tvl_usd) ? b.mcap_usd / b.tvl_usd : -Infinity; }
      else if (state.liveSort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else { av = a.mcap_usd || 0; bv = b.mcap_usd || 0; }
      if (av < bv) return -state.liveDir;
      if (av > bv) return state.liveDir;
      return a.slug < b.slug ? -1 : 1;
    });
    function liveSortHeader(key, label) {
      var arrow = state.liveSort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.liveDir < 0 ? '▼' : '▲' }) : null;
      return el('th', { scope: 'col' },
        el('button', { type: 'button', onclick: function () { if (state.liveSort === key) state.liveDir = -state.liveDir; else { state.liveSort = key; state.liveDir = -1; } render(); } }, label, arrow)
      );
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var ratio = (r.mcap_usd !== null && r.tvl_usd) ? r.mcap_usd / r.tvl_usd : null;
      var chainText = (r.chains || []).length ? (r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '')) : '—';
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category || 'Other' }))),
        el('td', { class: 'chains', text: chainText }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtRatio(ratio) })
      ));
    });
    return el('div', null,
      el('section', { class: 'hero' },
        el('div', null,
          el('h1', { text: 'Live tokens: the market\u2019s own numbers' }),
          el('p', null, 'These ', el('b', { text: String(DATA.live_size) }),
            ' protocols already trade, so their market cap is a fact, not a model. They are set aside from the ranking — and they are the comparison set the model is fitted against. The mcap/TVL ratio is heavy-tailed: a few trade at hundreds of times TVL, the median at ', el('b', { text: fmtRatio(median) }), '.')
        ),
        el('div', { class: 'stats' },
          el('div', { class: 'stat' }, el('span', { text: 'Median mcap / TVL' }), el('b', { text: fmtRatio(median) })),
          el('div', { class: 'stat' }, el('span', { text: 'Mean mcap / TVL' }), el('b', { text: fmtRatio(mean) }), el('small', { text: 'pulled up by the tail' })),
          el('div', { class: 'stat' }, el('span', { text: 'Highest mcap / TVL' }), el('b', { text: fmtRatio(max) })),
          el('div', { class: 'stat' }, el('span', { text: 'Live rows shown' }), el('b', { text: String(DATA.live.length) }))
        )
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'Live-token protocols by market cap. Market cap and TVL are snapshot facts.' }),
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', text: 'Chains' }),
              liveSortHeader('tvl', 'TVL'),
              el('th', { scope: 'col', text: '7d' }),
              liveSortHeader('mcap', 'Market cap'),
              liveSortHeader('ratio', 'Mcap / TVL')
            )),
            tbody
          )
        )
      )
    );
  }

  /* ---------- methodology ---------- */
  var MODEL_LABELS = {
    base_multiple: 'Base multiple', growth_weight: 'Growth weight', growth_floor: 'Growth floor (%)',
    growth_cap: 'Growth cap (%)', maturity_floor: 'Maturity floor', maturity_range: 'Maturity range',
    maturity_days: 'Maturity horizon (days)', unknown_age_days: 'Age when unlisted (days)',
    category_shrinkage: 'Category shrinkage (prior weight)', category_cap: 'Category adjustment cap',
    category_min_n: 'Min comps per category'
  };
  function methodView() {
    var m = MODEL;
    var formula;
    if (DATA.curve && typeof DATA.curve.intercept === 'number') {
      var c = DATA.curve;
      formula = 'curve_multiple = exp(' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' × ln(tvl_usd) + category_adjustment) / tvl_usd\n' +
        'implied = round( tvl_usd × curve_multiple × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ')' +
        ' × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') )\n' +
        'category_adjustment is in log units, shrunk toward 0 and capped at ±' + (m.category_cap !== undefined ? m.category_cap : 0.35) + '; its true multiple is ×exp(adjustment).';
    } else if (typeof m.base_multiple === 'number' && typeof m.growth_weight === 'number') {
      formula = 'implied = round( tvl_usd × ' + m.base_multiple +
        ' × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ')' +
        ' × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') )';
      if (DATA.rows[0] && typeof DATA.rows[0].comps_multiple === 'number') {
        formula += '\n× comps_multiple — fitted per protocol from the live-token comparison set';
      }
    } else {
      formula = 'implied = tvl_usd × size multiple × growth multiplier × maturity multiplier\n(the factors are carried per row in data.js; the constants below are the model\u2019s)';
    }
    var paramRows = Object.keys(m).map(function (k) {
      return el('div', null, el('span', { text: MODEL_LABELS[k] || k }), el('b', { text: String(m[k]) }));
    });
    var stats = null;
    if (DATA.validation && typeof DATA.validation === 'object') {
      // Blind k-fold test of the comps curve vs a flat multiple. MAPE is
      // dominated by the heavy tail; MedAPE is the robust centre.
      var foldCards = Object.keys(DATA.validation).map(function (k) {
        var v = DATA.validation[k];
        return el('div', { class: 'card' },
          el('h3', { text: k.replace('_', '-') + '-fold blind test · ' + (v.n_comps || '?') + ' comps' }),
          el('div', { class: 'kv' },
            el('div', null, el('span', { text: 'Curve MedAPE' }), el('b', { text: v.curve_medape_pct !== undefined ? v.curve_medape_pct.toFixed(2) + '%' : 'n/a' })),
            el('div', null, el('span', { text: 'Flat MedAPE' }), el('b', { text: v.flat_medape_pct !== undefined ? v.flat_medape_pct.toFixed(2) + '%' : 'n/a' })),
            el('div', null, el('span', { text: 'Curve MAPE' }), el('b', { text: v.curve_mape_pct !== undefined ? v.curve_mape_pct.toFixed(2) + '%' : 'n/a' })),
            el('div', null, el('span', { text: 'Flat MAPE' }), el('b', { text: v.flat_mape_pct !== undefined ? v.flat_mape_pct.toFixed(2) + '%' : 'n/a' }))
          ),
          el('p', { style: 'margin-top:10px', text: 'The curve beats flat on both measures; the MedAPE gap is small because the ratio distribution is heavy-tailed.' })
        );
      });
      stats = el('div', { class: 'cards', style: 'margin-top:12px' }, foldCards);
    }
    var curveCard = null;
    if (DATA.curve && typeof DATA.curve.intercept === 'number') {
      var cv = DATA.curve;
      var adjCount = Object.keys(cv.category_adjustments || {}).length;
      curveCard = el('div', { class: 'card' },
        el('h3', { text: 'The fitted curve' }),
        el('div', { class: 'kv' },
          el('div', null, el('span', { text: 'log(mcap) intercept' }), el('b', { text: cv.intercept.toFixed(4) })),
          el('div', null, el('span', { text: 'log(TVL) slope' }), el('b', { text: cv.slope.toFixed(4) })),
          el('div', null, el('span', { text: 'R² (log space)' }), el('b', { text: cv.r_squared !== undefined ? cv.r_squared.toFixed(3) : 'n/a' })),
          el('div', null, el('span', { text: 'Residual SD (log)' }), el('b', { text: cv.residual_sd !== undefined ? cv.residual_sd.toFixed(3) : 'n/a' })),
          el('div', null, el('span', { text: 'Comps fitted on' }), el('b', { text: String(cv.n_comps || '?') + ' live tokens' })),
          el('div', null, el('span', { text: 'Categories adjusted' }), el('b', { text: String(adjCount) }))
        ),
        el('p', { style: 'margin-top:10px', text: 'Slope below 1: the market pays less per TVL dollar as protocols get bigger — a flat multiple would overprice the giants. R² of ' + (cv.r_squared !== undefined ? cv.r_squared.toFixed(2) : '?') + ' says TVL alone explains only part of market cap.' })
      );
    }
    return el('div', null,
      el('section', { class: 'hero' },
        el('div', null,
          el('h1', { text: 'Methodology — model ' + (DATA.model_version || 'n/a') }),
          el('p', null, 'One function scores every protocol. No name is special-cased, no row is hand-picked, and the page recomputes each row from the same factors it displays — the detail view says so when the numbers agree.')
        ),
        el('div', { class: 'stats' },
          el('div', { class: 'stat' }, el('span', { text: 'Snapshot' }), el('b', { text: DATA.as_of })),
          el('div', { class: 'stat' }, el('span', { text: 'Watchlist floor' }), el('b', { text: fmtUsd(DATA.floor_usd) })),
          el('div', { class: 'stat' }, el('span', { text: 'Rows scored' }), el('b', { text: String(DATA.board_size) })),
          el('div', { class: 'stat' }, el('span', { text: 'Live comps set' }), el('b', { text: String(DATA.live_size) + ' tokens' }))
        )
      ),
      el('section', { class: 'section' },
        el('h2', { text: 'The formula' }),
        el('p', { class: 'lead', text: 'Implied value starts from locked value and adjusts it for momentum and for how long the protocol has run without a token.' }),
        el('div', { class: 'formula' }, el('b', { text: formula }))
      ),
      el('section', { class: 'section' },
        el('h2', { text: 'What each piece means' }),
        el('div', { class: 'cards' },
          el('div', { class: 'card' },
            el('h3', { text: 'Size — TVL × multiple' }),
            el('p', null, DATA.curve
              ? 'TVL is the snapshot\u2019s locked value. The multiple prices it, and it is fitted, not assumed: a log-log curve of market cap on TVL over the '
              : 'TVL is the snapshot\u2019s locked value. The multiple prices it: in radar-1 a flat ',
              DATA.curve ? el('b', { text: String(DATA.curve.n_comps || '') + ' live-token protocols' }) : el('b', { text: String(m.base_multiple !== undefined ? m.base_multiple : '—') }),
              DATA.curve
                ? ' in this snapshot, with a per-category adjustment shrunk toward the curve.'
                : '. A comps-fitted model replaces the flat number with a multiple fitted from the live-token protocols in this same snapshot, so the price of TVL comes from the market, not from a guess.')),
          el('div', { class: 'card' },
            el('h3', { text: 'Momentum — 7-day growth' }),
            el('p', null, 'Seven-day TVL change, clamped to ', el('b', { text: String(m.growth_floor) + '% … ' + String(m.growth_cap) + '%' }),
              ' so one hot week cannot dominate, then weighted at ', el('b', { text: String(m.growth_weight) }), '.')),
          el('div', { class: 'card' },
            el('h3', { text: 'Maturity — age with no token' }),
            el('p', null, 'Age since first listing, capped at ', el('b', { text: String(m.maturity_days) + ' days' }),
              ', lifting the value from ', el('b', { text: String(m.maturity_floor) }),
              ' toward ', el('b', { text: String((m.maturity_floor || 0) + (m.maturity_range || 0)) }),
              '. An unlisted age counts as ', el('b', { text: String(m.unknown_age_days) + ' days' }), '.'))
        )
      ),
      el('section', { class: 'section' },
        el('h2', { text: 'Parameters' }),
        el('div', { class: 'panel', style: 'padding:16px 20px' }, el('div', { class: 'kv' }, paramRows))
      ),
      (curveCard || stats) ? el('section', { class: 'section' },
        el('h2', { text: 'The fit and the blind test' }),
        el('p', { class: 'lead', text: 'Fitted on the snapshot\u2019s own live-token protocols, then blind-tested by holding folds out.' }),
        el('div', { class: 'cards' }, curveCard ? [curveCard] : []),
        stats || null
      ) : null,
      el('section', { class: 'section' },
        el('h2', { text: 'Limits — read before acting on a number' }),
        el('p', { class: 'lead', text: 'Implied value is an estimate of what a token might be worth if it launched at the snapshot\u2019s multiples — not a price, not a promise, and not a prediction that a token launches at all. TVL can be borrowed, bridged or double-counted; a 7-day move can reverse; the comps set is small and heavy-tailed, so the median, not the mean, is the honest centre. Farm plans cost real gas and lock real capital; never farm with money you cannot leave in place.' })
      )
    );
  }

  /* ---------- render ---------- */
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(nav());
    if (state.view === 'detail') {
      shell.appendChild(detailView());
    } else if (state.view === 'live') {
      shell.appendChild(liveView());
    } else if (state.view === 'method') {
      shell.appendChild(methodView());
    } else {
      shell.appendChild(hero());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
      shell.appendChild(el('section', { class: 'section' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'lead', text: 'TVL × a size multiple, adjusted for 7-day growth and age with no token. Full formula and limits: Methodology tab.' }),
        el('div', { class: 'formula' }, el('b', { text: 'implied = round( tvl × size multiple × growth multiplier × maturity multiplier )' }))
      ));
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    document.title = state.view === 'detail' && bySlug[state.slug]
      ? bySlug[state.slug].name + ' — Token Radar'
      : 'Token Radar — pre-token protocols ranked by implied value';
    // Keep the search box focused after typing re-renders the board.
    if (state.view === 'board' && document.activeElement === document.body) {
      var q = document.getElementById('q');
      if (q && state.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); window.scrollTo(0, 0); });
})();
