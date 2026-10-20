/* La Piña Investments, web demo: the Android app's screens recreated over simulated data, the
   strategy's engine ported to JavaScript (engine.js), and a guided tour that drives the phone. */
import {
  analyze, approvalGap, fmt, pct, times, day, shortDay, priceFmt, positionSize, pyramid, SELL_RULES, CONFIG, MARKETS,
  REGIME_LABEL, VERDICT_LABEL, PATTERNS, AUTO_LISTS, SCORE_MAX, TT_RULES, squarify, toneColor, changeTone, rsTone, heatWeight,
  stepPosition, openPosition, sell, Indicators as I, PAVA_GRADE, SUPPLY_CLASS, STOP_LABEL,
} from './engine.js';
import {
  buildWorld, practiceIndex, replayData, paperAccount, labBars, labContext, LAB_INSTRUMENT, LAB_PIVOT, LAB_REGIMES, REGIONS, SECTOR,
  TODAY, CAPITAL, RISK, EUR_PER_USD,
} from './data.js';
import {
  h, svg, icon, verdictChip, regimeChip, px, signed, rText, money, signedMoney, flag, MARKET_FLAG, sparkline, section, note, topBar,
  disclaimer, scoreBar, VERDICT_CLASS,
} from './ui.js';
import { priceChart, lineChart, chartsAvailable, THEME } from './charts.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const W = buildWorld();
const row = (sym) => W.rows.find((r) => r.instrument.symbol === sym);

const S = {
  tab: 'mercado',
  stack: [], // pushed screens: { screen, params }
  scanner: { view: 'list', list: null, verdict: 'ALL', q: '', color: 'CHANGE', scope: 'ALL', selected: null },
  ficha: { tab: 'veredicto' },
  lab: { volumeRatio: 2.7, closeVsPivot: 0.014, rs: 95, regime: 0, earnings: 31 },
  regime: null,
  replay: null,
  paper: null,
};

const root = document.getElementById('app');
let charts = [];
let timers = [];
let observers = [];
const clearCharts = () => { charts.forEach((c) => { try { c.remove(); } catch { /* gone */ } }); charts = []; timers.forEach(clearInterval); timers = []; observers.forEach((o) => o.disconnect()); observers = []; };

// ---------- shell ----------

const TABS = [
  ['mercado', 'Mercado', 'market'], ['escaner', 'Escáner', 'search'], ['seguimiento', 'Seguimiento', 'star'],
  ['cartera', 'Cartera', 'wallet'], ['aprender', 'Aprender', 'school'],
];
const view = h('div', { class: 'a-view', tabindex: '-1' });
const tabbar = h('nav', { class: 'a-tabbar', 'aria-label': 'Pestañas de la app' },
  TABS.map(([key, label, ic]) => h('button', { type: 'button', class: 'a-tab', dataset: { tab: key }, onclick: () => go(key) },
    h('span', { class: 'a-tab-pill' }, icon(ic)), h('span', { class: 'a-tab-label' }, label))));
root.append(
  h('div', { class: 'a-status', 'aria-hidden': 'true' }, h('span', null, '18:05'), h('span', { class: 'a-status-r' }, h('i'), h('i'), h('i'))),
  view, tabbar,
);

let lastKey = null;
function current() { return S.stack.length ? S.stack[S.stack.length - 1] : { screen: S.tab, params: {} }; }
function render(keepScroll = true) {
  const cur = current();
  const key = cur.screen + JSON.stringify(cur.params || {});
  const scroll = keepScroll && key === lastKey ? view.scrollTop : 0;
  clearCharts();
  view.replaceChildren(SCREENS[cur.screen](cur.params || {}));
  view.scrollTop = scroll;
  lastKey = key;
  for (const b of tabbar.querySelectorAll('.a-tab')) {
    const on = b.dataset.tab === S.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
function go(tab) { S.tab = tab; S.stack = []; render(false); view.focus({ preventScroll: true }); }
function push(screen, params = {}) { S.stack.push({ screen, params }); render(false); view.focus({ preventScroll: true }); }
function back() { S.stack.pop(); render(false); }

// ---------- Mercado ----------

function screenMercado() {
  const counts = { APPROVED: 0, WATCH: 0, REJECTED: 0 };
  W.rows.forEach((r) => counts[r.analysis.verdict]++);
  const regimeCard = section('Régimen de mercado',
    note('Cuánto deja invertir la estrategia en cada bolsa: manda el peor estado entre sus índices (en Europa, el índice europeo y el del país). En corrección no hay compras nuevas.'),
    h('div', { class: 'a-regime-list' }, REGIONS.map((r) => {
      const g = W.regimes[r.key];
      return h('div', { class: 'a-regime-row' }, h('span', { class: 'a-regime-name' }, flag(r.flag), r.label), regimeChip(g.state), h('b', null, `${g.maxExposurePct} %`));
    })),
    h('hr'),
    h('h4', null, 'Índices'),
    note('Cierre frente a sus medias de 50 y 200 sesiones, y días de distribución (caídas con más volumen) de las últimas 25 sesiones.'),
    Object.values(W.indices).map((ix) => {
      const b = ix.bars, c = b.at(-1).close, ch = c / b.at(-2).close - 1;
      const cl = b.map((x) => x.close);
      const st = ix.timeline.at(-1);
      return h('div', { class: 'a-index' },
        h('div', { class: 'a-index-head' }, h('b', null, ix.name), h('span', null, fmt(c), ' ', h('span', { class: ch >= 0 ? 'up' : 'down' }, signed(ch)))),
        h('div', { class: 'a-index-sub' }, regimeChip(st.state),
          h('span', { class: 'a-note' }, `SMA50 ${signed(c / I.sma(cl, 50) - 1)} · SMA200 ${signed(c / I.sma(cl, 200) - 1)} · ${st.distributionDays} ${st.distributionDays === 1 ? 'día' : 'días'} de distribución`)));
    }));
  regimeCard.id = 'tour-regime';

  const summary = section('Veredictos del cierre',
    h('div', { class: 'a-tiles' }, ['APPROVED', 'WATCH', 'REJECTED'].map((v) => h('button', {
      type: 'button', class: `a-tile ${VERDICT_CLASS[v]}`, onclick: () => { S.scanner.verdict = v; S.scanner.view = 'list'; S.scanner.list = null; go('escaner'); },
    }, h('b', null, String(counts[v])), h('span', null, VERDICT_LABEL[v])))),
    note('Toca un recuadro para ver esos valores en el Escáner.'));

  // Sectors: each sector's day weighted by the money its stocks move, as the heat map.
  const sectors = {};
  for (const r of W.rows) {
    const s = (sectors[r.sector] ||= { w: 0, sum: 0, up: 0, down: 0, n: 0 });
    const w = heatWeight(r.tradedValue);
    s.w += w; s.sum += w * r.changePct; s.n++; if (r.changePct >= 0) s.up++; else s.down++;
  }
  const sectorLines = Object.entries(sectors).map(([k, s]) => ({ k, ch: s.sum / s.w, ...s })).sort((a, b) => b.ch - a.ch);
  const maxAbs = Math.max(0.005, ...sectorLines.map((s) => Math.abs(s.ch)));
  const sectorCard = section('Sectores',
    note('Cambio del día de cada sector, con sus acciones pesadas por el dinero que mueven, como en el mapa de calor. No entra en el veredicto.'),
    sectorLines.map((s) => h('div', { class: 'a-sector' },
      h('span', { class: 'a-sector-name' }, SECTOR[s.k]),
      h('span', { class: 'a-sector-bar' }, h('i', { style: `width:${(Math.abs(s.ch) / maxAbs * 50).toFixed(1)}%;${s.ch >= 0 ? 'left:50%' : `right:50%`};background:${toneColor(changeTone(s.ch))}` })),
      h('span', { class: s.ch >= 0 ? 'up' : 'down' }, signed(s.ch)),
      h('span', { class: 'a-note' }, `${s.up}↑ ${s.down}↓`))));

  const listCard = (title, key, empty) => {
    const rows = W.rows.filter((r) => r.lists.includes(key));
    const card = section(title, rows.length ? rows.map((r) => miniRow(r)) : note(empty));
    return card;
  };
  const breakouts = listCard('Roturas de hoy con PAVA', 'PAVA_BREAKOUT', 'Ningún valor rompió su pivot en este cierre con el volumen que pide la estrategia.');
  breakouts.id = 'tour-breakouts';
  return h('div', null,
    topBar('Mercado', 'Estrategia Piña Investments'),
    h('div', { class: 'a-body' },
      disclaimer(),
      note(`Cierre del ${shortDay(TODAY)} · ${W.rows.length} valores simulados. Solo cierres, nunca intradía.`),
      regimeCard, summary, breakouts,
      listCard('Cerca del pivot', 'NEAR_PIVOT', 'Ningún valor con una base válida cerró a menos de un 5 % de su pivot.'),
      sectorCard));
}

function miniRow(r) {
  const a = r.analysis;
  return h('button', { type: 'button', class: 'a-mini', onclick: () => push('ficha', { sym: r.instrument.symbol }) },
    h('span', { class: 'a-mini-name' }, h('b', null, r.instrument.name), h('span', { class: 'a-note' }, `${r.instrument.symbol} · ${a.pattern ? PATTERNS[a.pattern.type].label : 'sin patrón'}`)),
    verdictChip(a.verdict));
}

// ---------- Escáner ----------

function screenEscaner() {
  const sc = S.scanner;
  const toggle = h('button', {
    type: 'button', class: 'a-icon-btn', 'aria-label': sc.view === 'list' ? 'Ver mapa de calor' : 'Ver lista', 'aria-pressed': sc.view === 'map' ? 'true' : 'false',
    onclick: () => { sc.view = sc.view === 'list' ? 'map' : 'list'; render(false); },
  }, icon(sc.view === 'list' ? 'grid' : 'list'));
  toggle.id = 'tour-maptoggle';
  const body = h('div', { class: 'a-body' }, disclaimer());
  if (sc.view === 'map') body.append(heatMap());
  else body.append(scannerList());
  return h('div', null, topBar('Escáner', 'Estrategia Piña Investments', [toggle]), body);
}

function scannerList() {
  const sc = S.scanner;
  const listBox = h('div', { class: 'a-rows' });
  const countLine = h('p', { class: 'a-count' });
  const fill = () => {
    const q = sc.q.trim().toLowerCase();
    const rows = W.rows.filter((r) => (sc.verdict === 'ALL' || r.analysis.verdict === sc.verdict) && (!sc.list || r.lists.includes(sc.list)) &&
      (!q || r.instrument.name.toLowerCase().includes(q) || r.instrument.symbol.toLowerCase().includes(q)));
    countLine.textContent = `${rows.length} de ${W.rows.length} valores, por veredicto y puntuación`;
    listBox.replaceChildren(...(rows.length ? rows.map(scanRow) : [note('Ningún valor cumple estos filtros.')]));
  };
  const search = h('input', { type: 'search', name: 'q', id: 'scan-search', class: 'a-search', placeholder: 'Buscar por nombre o símbolo', 'aria-label': 'Buscar por nombre o símbolo', value: sc.q });
  search.addEventListener('input', () => { sc.q = search.value; fill(); });
  const lists = h('div', { class: 'a-chips', role: 'group', 'aria-label': 'Listas automáticas' }, Object.entries(AUTO_LISTS).map(([k, label]) => {
    const n = W.rows.filter((r) => r.lists.includes(k)).length;
    return h('button', { type: 'button', class: 'a-fchip' + (sc.list === k ? ' on' : ''), 'aria-pressed': sc.list === k ? 'true' : 'false', onclick: () => { sc.list = sc.list === k ? null : k; render(); } }, `${label} (${n})`);
  }));
  lists.id = 'tour-lists';
  const verdicts = h('div', { class: 'a-chips', role: 'group', 'aria-label': 'Veredicto' }, [['ALL', 'Todos'], ['APPROVED', 'Aprobados'], ['WATCH', 'Vigilancia'], ['REJECTED', 'Rechazados']].map(([k, label]) => {
    const n = k === 'ALL' ? W.rows.length : W.rows.filter((r) => r.analysis.verdict === k).length;
    return h('button', { type: 'button', class: 'a-fchip' + (sc.verdict === k ? ' on' : ''), 'aria-pressed': sc.verdict === k ? 'true' : 'false', onclick: () => { sc.verdict = k; render(); } }, `${label} (${n})`);
  }));
  fill();
  return h('div', { class: 'a-stack' }, search, h('p', { class: 'a-label' }, 'Listas automáticas'), lists, verdicts, countLine, listBox);
}

function scanRow(r) {
  const a = r.analysis;
  const last = r.bars.at(-1);
  const vs = a.pattern ? last.close / a.pattern.pivot - 1 : null;
  const card = h('button', { type: 'button', class: 'a-row', onclick: () => push('ficha', { sym: r.instrument.symbol }), 'aria-label': `${r.instrument.name}, ${VERDICT_LABEL[a.verdict]}` },
    h('div', { class: 'a-row-top' },
      h('div', null, h('b', { class: 'a-row-name' }, r.instrument.name), h('span', { class: 'a-row-sym' }, flag(MARKET_FLAG[r.instrument.market]), `${r.instrument.symbol} · ${MARKETS[r.instrument.market].label}`)),
      verdictChip(a.verdict)),
    h('div', { class: 'a-row-mid' },
      h('div', null,
        h('p', { class: 'a-row-price' }, px(last.close), ' ', h('span', { class: r.changePct >= 0 ? 'up' : 'down' }, signed(r.changePct))),
        h('p', { class: 'a-row-facts' }, h('span', null, `RS ${r.rsRating ?? '–'}`), a.score != null ? h('span', null, `Puntos ${a.score}`) : null,
          a.relativeVolume != null ? h('span', { class: a.relativeVolume >= 1.4 ? 'hot' : '' }, `Volumen ${fmt(a.relativeVolume, 1)}×`) : null),
        vs != null ? h('p', { class: 'a-row-facts' }, h('span', null, `${pct(Math.abs(vs))} ${vs >= 0 ? 'sobre' : 'bajo'} el pivot`), h('span', { class: 'pat' }, PATTERNS[a.pattern.type].label)) : null),
      sparkline(r.bars, a.pattern?.pivot)),
    r.lists.length ? h('p', { class: 'a-row-lists' }, r.lists.map((k) => h('span', null, AUTO_LISTS[k]))) : null,
    a.headline ? h('p', { class: 'a-row-why' }, a.headline) : h('p', { class: 'a-row-why ok' }, 'Cumple todas las reglas: plan de compra en la ficha.'));
  return card;
}

function heatMap() {
  const sc = S.scanner;
  const wrap = h('div', { class: 'a-map', id: 'tour-map' });
  const colorChips = h('div', { class: 'a-chips', role: 'group', 'aria-label': 'Color' }, h('span', { class: 'a-label inline' }, 'Color:'),
    [['CHANGE', 'Cambio del día'], ['VERDICT', 'Veredicto'], ['RS', 'Fuerza relativa']].map(([k, l]) => h('button', { type: 'button', class: 'a-fchip' + (sc.color === k ? ' on' : ''), 'aria-pressed': sc.color === k ? 'true' : 'false', onclick: () => { sc.color = k; render(); } }, l)));
  const scopeChips = h('div', { class: 'a-chips', role: 'group', 'aria-label': 'Región' },
    [['ALL', 'Todos'], ['US', 'EE. UU.'], ['EUROPE', 'Europa']].map(([k, l]) => h('button', { type: 'button', class: 'a-fchip' + (sc.scope === k ? ' on' : ''), 'aria-pressed': sc.scope === k ? 'true' : 'false', onclick: () => { sc.scope = k; sc.selected = null; render(); } }, l)));
  const rows = W.rows.filter((r) => sc.scope === 'ALL' || MARKETS[r.instrument.market].region === sc.scope);
  const board = h('div', { class: 'a-map-board' });
  const card = h('div', { class: 'a-map-card', 'aria-live': 'polite' });
  const colorOf = (r) => (sc.color === 'CHANGE' ? toneColor(changeTone(r.changePct))
    : sc.color === 'RS' ? toneColor(rsTone(r.rsRating)) : { APPROVED: '#2F9E4F', WATCH: '#A8770F', REJECTED: '#8B444E' }[r.analysis.verdict]);
  const valueOf = (r) => (sc.color === 'RS' ? `RS ${r.rsRating}` : sc.color === 'VERDICT' ? VERDICT_LABEL[r.analysis.verdict].slice(0, 4) + '.' : signed(r.changePct));
  const showCard = (r) => {
    sc.selected = r ? r.instrument.symbol : null;
    card.replaceChildren(...(r ? [
      h('div', null, h('b', null, r.instrument.name), h('span', { class: 'a-note' }, ` ${r.instrument.symbol} · ${SECTOR[r.sector]}`)),
      h('p', null, `${px(r.bars.at(-1).close)} `, h('span', { class: r.changePct >= 0 ? 'up' : 'down' }, signed(r.changePct)), ` · RS ${r.rsRating} · `, verdictChip(r.analysis.verdict)),
      h('button', { type: 'button', class: 'a-btn text', onclick: () => push('ficha', { sym: r.instrument.symbol }) }, 'Abrir la ficha'),
    ] : [note('Toca una acción para ver su ficha.')]));
  };
  const draw = () => {
    const width = Math.max(240, board.clientWidth || 340);
    const height = Math.round(width * 1.25);
    board.style.height = height + 'px';
    const groups = {};
    for (const r of rows) (groups[r.sector] ||= []).push(r);
    const keys = Object.keys(groups);
    const boxes = squarify(keys.map((k) => groups[k].reduce((s, r) => s + heatWeight(r.tradedValue), 0)), { x: 0, y: 0, w: width, h: height });
    board.replaceChildren();
    keys.forEach((k, gi) => {
      const b = boxes[gi];
      const g = { x: b.x + 1, y: b.y + 1, w: Math.max(0, b.w - 2), h: Math.max(0, b.h - 2) };
      const header = g.h > 50 && g.w > 64 ? 15 : 0;
      if (header) board.append(h('div', { class: 'a-map-head', style: `left:${g.x}px;top:${g.y}px;width:${g.w}px` }, SECTOR[k]));
      const inner = { x: g.x, y: g.y + header, w: g.w, h: g.h - header };
      const members = groups[k];
      const tiles = squarify(members.map((r) => heatWeight(r.tradedValue)), inner);
      members.forEach((r, i) => {
        const t = tiles[i];
        const label = r.instrument.symbol.split('.')[0];
        const big = Math.min(t.w, t.h);
        const tile = h('button', {
          type: 'button', class: 'a-tile-map' + (sc.selected === r.instrument.symbol ? ' sel' : ''), 'aria-label': `${r.instrument.name}: ${signed(r.changePct)}, ${VERDICT_LABEL[r.analysis.verdict]}`,
          style: `left:${t.x}px;top:${t.y}px;width:${Math.max(0, t.w - 1)}px;height:${Math.max(0, t.h - 1)}px;background:${colorOf(r)};font-size:${Math.max(9, Math.min(15, big / 4.2)).toFixed(1)}px`,
          onclick: () => { showCard(r); board.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel')); tile.classList.add('sel'); },
        }, big > 26 ? h('b', null, label) : null, big > 40 ? h('span', null, valueOf(r)) : null);
        board.append(tile);
      });
    });
  };
  showCard(sc.selected ? row(sc.selected) : null);
  let drawnWidth = 0;
  const redraw = () => { const w = board.clientWidth; if (w && Math.abs(w - drawnWidth) > 1) { drawnWidth = w; draw(); } };
  requestAnimationFrame(redraw);
  if (window.ResizeObserver) { const ro = new ResizeObserver(redraw); ro.observe(board); observers.push(ro); }
  const legend = sc.color === 'VERDICT'
    ? h('div', { class: 'a-legend-v' }, ['APPROVED', 'WATCH', 'REJECTED'].map((v) => h('span', null, h('i', { class: VERDICT_CLASS[v] }), VERDICT_LABEL[v])))
    : h('div', null, h('div', { class: 'a-gradient' }), h('div', { class: 'a-gradient-labels' }, sc.color === 'RS' ? ['40', '70', '100'].map((x) => h('span', null, x)) : ['−3 %', '0 %', '+3 %'].map((x) => h('span', null, x))));
  wrap.append(colorChips, scopeChips, board, legend,
    note(sc.color === 'CHANGE' ? 'Color: cambio del último cierre; rojo intenso desde −3 %, verde intenso desde +3 %. Tamaño: efectivo medio negociado en 50 sesiones, en raíz cuadrada para que las pequeñas se vean. Agrupado por sector con un treemap «squarified».'
      : sc.color === 'RS' ? 'Color: RS de 1 a 99; 70 es neutro, 90 (lo que pide la estrategia) es dos tercios de verde.' : 'Color: el veredicto de este cierre.'),
    card);
  return wrap;
}

// ---------- Ficha ----------

const STATUS_ICON = { PASS: ['check', 'ok', 'Cumple'], FAIL: ['cross', 'bad', 'Falla'], BLOCK: ['block', 'watch', 'Bloquea'], INFO: ['info', 'muted', 'Información'], NOT_APPLICABLE: ['dash', 'muted', 'No aplica'] };

export function ruleList(a, changed = new Set()) {
  return h('ol', { class: 'a-rules' }, a.rules.map((r) => {
    const [ic, cls, label] = STATUS_ICON[r.status];
    const li = h('li', { class: `a-rule ${cls}${changed.has(r.rule) ? ' changed' : ''}` },
      h('span', { class: 'a-rule-ic', role: 'img', 'aria-label': label }, icon(ic, 18)),
      h('div', null, h('b', null, r.title), h('p', null, r.reason)));
    if (r.rule === 'TREND' && a.trend) {
      li.querySelector('div').append(h('ul', { class: 'a-tt' }, Object.entries(a.trend.checks).map(([k, ok]) =>
        h('li', { class: ok ? 'ok' : 'bad' }, icon(ok ? 'check' : 'cross', 14), `${k} · ${TT_RULES[k]}`))));
    }
    return li;
  }));
}

export function scoreCard(a) {
  const p = a.scoreParts;
  if (!p) return section('Puntuación', note('Sin puntuación: la puntuación solo se calcula cuando ninguna regla estructural (H1-H6) falla.'));
  return section(`Puntuación ${p.total}/100 por bloques`,
    scoreBar('RS y línea RS', p.rs, SCORE_MAX.rs), scoreBar('Calidad del patrón', p.pattern, SCORE_MAX.pattern),
    scoreBar('Volumen (PAVA o secado)', p.volume, SCORE_MAX.volume), scoreBar('Oferta por encima', p.supply, SCORE_MAX.supply),
    scoreBar('Tendencia', p.trend, SCORE_MAX.trend),
    h('div', { class: 'a-score-head muted' }, h('span', null, 'Fundamentales'), h('span', null, 'sin fuente · / 10')),
    note('Sin datos de fundamentales, los otros 90 puntos se reescalan a 100. Hacen falta 70 para APROBADO y 50 para VIGILANCIA.'));
}

export function gapCard(a, bars) {
  const gap = approvalGap(a, bars);
  if (!gap.length) return null;
  return section('Qué falta para APROBADO', h('ul', { class: 'a-gap' }, gap.map((g) => h('li', null, icon(g.temporary ? 'calendar' : 'pulse', 20),
    h('div', null, h('p', null, g.text), h('span', { class: 'a-note' }, `${g.title} · ${g.temporary ? 'se revisa en cada cierre' : 'estructural: semanas, no sesiones'}`))))));
}

const MEANING = {
  APPROVED: ['Qué significa APROBADO', 'Cumple todas las reglas estructurales, ningún bloqueo temporal y una puntuación de 70 o más.', 'Qué hacer: comprar según el plan, con el stop puesto en el broker. La app no compra por ti.'],
  WATCH: ['Qué significa VIGILANCIA', 'La estructura es buena, pero hay un bloqueo temporal: rotura aún sin volumen, precio a menos de un 5 % del pivot, RS entre 80 y 89, mercado en corrección, resultados en pocas sesiones o puntuación 50-69. No es una compra.', 'Qué hacer: seguirlo. La app dice qué falta y avisa cuando se cumpla.'],
  REJECTED: ['Qué significa RECHAZADO', 'Falla una regla estructural: datos, liquidez, tendencia, fuerza relativa, patrón o posición frente al pivot; o la puntuación no llega a 50.', 'Qué hacer: nada. Sale de la lista hasta que cambie la estructura.'],
};

function screenFicha({ sym }) {
  const r = row(sym);
  const a = r.analysis;
  const last = r.bars.at(-1);
  const m = MARKETS[r.instrument.market];
  const tabs = [['veredicto', 'Veredicto'], ['grafico', 'Gráfico'], ['plan', 'Plan']];
  const tabRow = h('div', { class: 'a-tabs', role: 'tablist', 'aria-label': 'Secciones de la ficha' }, tabs.map(([k, l]) => h('button', {
    type: 'button', role: 'tab', class: 'a-tabs-btn' + (S.ficha.tab === k ? ' on' : ''), 'aria-selected': S.ficha.tab === k ? 'true' : 'false', id: `tab-${k}`,
    onclick: () => { S.ficha.tab = k; render(false); },
  }, l)));
  const head = h('div', { class: 'a-ficha-head' },
    h('div', null, h('h3', null, r.instrument.name),
      h('p', { class: 'a-ficha-price' }, px(last.close), ' ', h('span', { class: r.changePct >= 0 ? 'up' : 'down' }, signed(r.changePct))),
      h('p', { class: 'a-note' }, `Cierre ${day(last.date)} · datos simulados (gráfico diario) · ${m.label} · ${m.currency}`)),
    h('div', { class: 'a-ficha-verdict' }, verdictChip(a.verdict, true), a.score != null ? h('b', null, `${a.score}/100`) : null));
  const content = h('div', { class: 'a-body', role: 'tabpanel', 'aria-labelledby': `tab-${S.ficha.tab}` });
  if (S.ficha.tab === 'veredicto') {
    const [t, d, todo] = MEANING[a.verdict];
    const rules = section('Reglas, una a una', note('En el orden de la metodología v2: H1-H6 son estructurales (si una falla, RECHAZADO), B1-B5 son bloqueos temporales (VIGILANCIA) y S es la puntuación.'), ruleList(a));
    rules.id = 'tour-rules';
    content.append(section(t, h('p', null, d), h('p', { class: 'a-strong' }, todo)), gapCard(a, r.bars) || '', rules, scoreCard(a),
      a.notes.length ? section('Notas', h('ul', { class: 'a-notes' }, a.notes.map((n) => h('li', null, n)))) : '',
      a.comparison ? section(`Frente al ${a.comparison.indexName}: ${a.comparison.conclusion}`, note(a.comparison.summary)) : '');
  } else if (S.ficha.tab === 'grafico') {
    content.append(chartPanel(r), section('Cómo leer el gráfico',
      h('ul', { class: 'a-notes' },
        h('li', null, 'Velas diarias de cierre (nunca intradía). Arrastra para moverte; pasa el dedo o el ratón para ver los datos de una sesión.'),
        h('li', null, 'Medias: gris = 20 sesiones, azul = 50 (10 semanas), morada = 200 (40 semanas). La plantilla de tendencia exige la azul sobre la morada.'),
        h('li', null, 'Líneas: verde «Compra» = pivot; ámbar «Ext.» = pivot + 5 %, el final del rango de compra; roja «Stop» = el stop del plan.'),
        h('li', null, 'Volumen en el panel inferior con su media de 50 sesiones (ámbar) y 1,4 veces esa media (discontinua): una rotura válida (PAVA) cierra por encima del pivot con el volumen por encima de esa línea.'))));
  } else {
    content.append(...planTab(r));
  }
  return h('div', null, topBar(r.instrument.symbol, null, [], back), h('div', { class: 'a-body tight' }, head, a.headline ? h('p', { class: 'a-headline' }, a.headline) : null), tabRow, content);
}

function chartPanel(r) {
  const a = r.analysis;
  const box = h('div', { class: 'a-chart', id: 'tour-chart' });
  const legend = { ohlc: h('p', { class: 'a-legend-ohlc' }), vol: h('p', { class: 'a-legend-vol' }), mas: h('p', { class: 'a-legend-mas' }) };
  const wrap = h('div', { class: 'a-chart-wrap' },
    h('div', { class: 'a-legend' }, h('b', null, `${r.instrument.symbol} · 1D · ${MARKETS[r.instrument.market].currency}`), legend.ohlc, legend.vol,
      h('p', { class: 'a-legend-mas' }, h('i', { class: 'k20' }), 'MM20 ', h('i', { class: 'k50' }), 'MM50 ', h('i', { class: 'k200' }), 'MM200'), legend.mas),
    box);
  if (!chartsAvailable()) { box.append(note('El gráfico no se pudo cargar.')); return wrap; }
  requestAnimationFrame(() => {
    const markers = [];
    if (a.pava?.breakoutDate) {
      markers.push({ time: a.pava.breakoutDate, position: 'belowBar', shape: 'arrowUp', color: a.pava.confirmedDate ? THEME.pivot : '#F5A524', text: `Rotura ${a.pava.volumeRatio != null ? times(a.pava.volumeRatio) : ''}` });
    }
    const t = r.bars.length - 1;
    const c = priceChart(box, r.bars, { pivot: a.pattern?.pivot ?? null, stop: a.plan?.stop ?? null, high52: I.highest(r.bars, t - 251, t), markers, legend });
    charts.push(c.chart);
  });
  return wrap;
}

function planTab(r) {
  const a = r.analysis;
  const p = a.plan;
  if (!p) {
    return [section('Sin plan', h('p', null, `${VERDICT_LABEL[a.verdict]}: la estrategia no da plan de compra mientras falle una regla estructural.`)), gapCard(a, r.bars) || ''];
  }
  const fx = MARKETS[r.instrument.market].currency === 'USD' ? EUR_PER_USD : 1;
  const d = priceFmt(p.entry);
  const out = [];
  const levels = section(p.actionable ? 'Plan de compra' : 'Plan condicional',
    p.actionable ? null : note('En VIGILANCIA el plan es condicional y no tiene tamaño: solo vale si el valor pasa a APROBADO.'),
    h('dl', { class: 'a-dl' },
      h('dt', null, 'Entrada'), h('dd', null, d(p.entry), a.pava?.confirmedDate ? ' (cierre de la rotura)' : ' (el pivot)'),
      h('dt', null, 'Rango de compra'), h('dd', null, `${d(p.buyRangeLow)} – ${d(p.buyRangeHigh)}`),
      h('dt', null, 'Stop inicial'), h('dd', null, `${d(p.stop)} (${STOP_LABEL[p.stopType]}, −${pct(p.riskPct)})`),
      h('dt', null, 'Resultados'), h('dd', null, p.sessionsToEarnings != null ? `en ${p.sessionsToEarnings} sesiones` : 'fecha no disponible')),
  );
  levels.id = 'tour-plan';
  out.push(levels);
  if (p.actionable) {
    const size = positionSize(CAPITAL, RISK, p.entry, p.stop, 0.20, fx);
    out.push(section(`Tamaño con ${money(CAPITAL, 0)} y riesgo del ${pct(RISK)}`,
      h('div', { class: 'a-kpis' },
        kpi('Acciones', fmt(size.quantity, 0)), kpi('Posición', money(size.positionValue)), kpi('Peso', pct(size.weightPct)), kpi('Riesgo al stop', money(size.riskAmount))),
      note(`Fórmula de la app: acciones = mín(capital × riesgo ÷ (entrada − stop), capital × 20 % ÷ entrada), redondeado hacia abajo. ` +
        `${fmt(CAPITAL, 0)} × ${pct(RISK)} = ${money(CAPITAL * RISK)} de riesgo; por acción se arriesgan ${money((p.entry - p.stop) * fx)}` +
        (fx !== 1 ? ` (en euros, a 1 € = 1,09 $, tipo fijo de la demo).` : '.') +
        (size.byWeight < size.byRisk ? ' Aquí manda el peso máximo del 20 %.' : '')),
      h('h4', null, 'Pirámide 50/30/20, solo en ganadoras'),
      h('ol', { class: 'a-tranches' }, pyramid(size.quantity, p.entry, p.buyRangeLow, 2).map((t) => h('li', null, h('b', null, `Tramo ${t.number}: ${fmt(t.quantity, 0)} acciones`), h('p', null, t.condition))))));
  }
  out.push(section('Reglas de venta', h('ul', { class: 'a-notes' }, SELL_RULES.map((s) => h('li', null, s)))));
  if (a.comparison) out.push(section(`Frente al ${a.comparison.indexName}: ${a.comparison.conclusion}`, note(a.comparison.summary)));
  return out;
}
const kpi = (label, value) => h('div', { class: 'a-kpi' }, h('span', null, label), h('b', null, value));

// ---------- Seguimiento ----------

function screenSeguimiento() {
  const followed = W.rows.filter((r) => r.analysis.verdict !== 'REJECTED' || r.lists.includes('EXTENDED')).slice(0, 8);
  return h('div', null, topBar('Seguimiento', 'Tus listas y avisos'),
    h('div', { class: 'a-body' },
      note('Los valores que sigues, con el veredicto de cada cierre. La app avisa cuando cambia el veredicto, cuando un valor rompe su pivot con PAVA y cuando salta una regla de venta en la Cartera.'),
      section('Mi lista', followed.map((r) => {
        const a = r.analysis;
        const change = r.previous !== a.verdict ? h('span', { class: 'a-note' }, `Antes: ${VERDICT_LABEL[r.previous]}`) : null;
        return h('button', { type: 'button', class: 'a-mini', onclick: () => push('ficha', { sym: r.instrument.symbol }) },
          h('span', { class: 'a-mini-name' }, h('b', null, r.instrument.name), h('span', { class: 'a-note' }, `${r.instrument.symbol} · RS ${r.rsRating}${a.score != null ? ` · ${a.score}/100` : ''}`), change),
          verdictChip(a.verdict));
      })),
      section('Avisos de hoy', h('ul', { class: 'a-notes' }, W.rows.filter((r) => r.lists.includes('VERDICT_CHANGE') || r.lists.includes('PAVA_BREAKOUT')).map((r) =>
        h('li', null, `${r.instrument.name}: ${r.lists.includes('PAVA_BREAKOUT') ? 'rotura con PAVA al cierre' : 'cambio de veredicto'}, de ${VERDICT_LABEL[r.previous]} a ${VERDICT_LABEL[r.analysis.verdict]}.`))))));
}

// ---------- Cartera ----------

function screenCartera() {
  const body = h('div', { class: 'a-body' }, disclaimer());
  const el = h('div', null, topBar('Cartera', 'Simulada: el método con 10.000 €'), body);
  if (!S.paper) {
    body.append(note('Calculando la cuenta simulada: el método recorre los últimos 90 cierres de cada valor…'));
    setTimeout(() => { S.paper = paperAccount(90); if (current().screen === 'cartera') render(); }, 30);
    return el;
  }
  const { trades, curve, bench } = S.paper;
  const w = W;
  const closed = trades.filter((t) => !t.open), open = trades.filter((t) => t.open);
  const value = curve.at(-1).value;
  const closedEur = closed.reduce((s, t) => s + t.result * t.fx, 0);
  const latent = open.reduce((s, t) => s + t.result * t.fx, 0);
  let invested = 0, openRisk = 0;
  for (const t of open) {
    const bars = row(t.symbol).bars;
    const qty = t.fills.reduce((s, f) => s + f.quantity, 0);
    invested += qty * bars.at(-1).close * t.fx;
    // What the position would lose against its cost if its stop were hit: nothing once the stop sits at breakeven.
    openRisk += Math.max(0, qty * (t.entry - t.currentStop) * t.fx);
  }
  const cash = value - invested;
  body.append(
    section('Cartera simulada',
      h('p', { class: 'a-big' }, money(value), ' ', h('span', { class: value >= CAPITAL ? 'up' : 'down' }, signed(value / CAPITAL - 1))),
      note(`Valor al último cierre, desde ${money(CAPITAL, 0)} el ${day(curve[0].date)}. Riesgo por operación: ${pct(RISK)} de la cuenta; peso máximo 20 %.`),
      h('div', { class: 'a-kpis' }, kpi('Efectivo', money(cash, 0)), kpi('Invertido', `${money(invested, 0)} (${pct(invested / value)})`), kpi('Cerrado', signedMoney(closedEur)), kpi('Latente', signedMoney(latent))),
      h('p', null, `Riesgo abierto: ${money(openRisk, 0)}, el ${pct(openRisk / value)} del valor (máx. ${pct(CONFIG.maxOpenRisk)})`),
      h('div', { class: 'a-meter' }, h('i', { style: `width:${Math.min(100, openRisk / value / CONFIG.maxOpenRisk * 100).toFixed(1)}%` })),
      h('p', null, `Posiciones: ${open.length} de ${CONFIG.maxPositions}`),
      h('div', { class: 'a-meter' }, h('i', { style: `width:${(open.length / CONFIG.maxPositions * 100).toFixed(1)}%` }))),
    section('Exposición que permite el régimen', REGIONS.map((r) => h('div', { class: 'a-regime-row' }, h('span', { class: 'a-regime-name' }, flag(r.flag), r.label), regimeChip(w.regimes[r.key].state), h('b', null, `${w.regimes[r.key].maxExposurePct} %`))),
      note('Con el mercado en corrección no hay compras nuevas; bajo presión, como mucho la mitad invertida.')),
  );
  const chartBox = h('div', { class: 'a-chart small' });
  body.append(section('Curva de capital frente al índice', chartBox, h('p', { class: 'a-keys' }, h('span', null, h('i', { class: 'k-eq' }), 'Cuenta'), h('span', null, h('i', { class: 'k-ix' }), 'Índice EE. UU. (desde 10.000 €)'))));
  if (chartsAvailable()) requestAnimationFrame(() => charts.push(lineChart(chartBox, [{ data: bench, color: '#8B98A9', width: 1, dashed: true }, { data: curve, color: '#4C8DFF' }], { digits: 0 })));
  const tradeRow = (t) => {
    const bars = row(t.symbol).bars;
    return h('div', { class: 'a-trade' },
      h('div', null, h('b', null, t.name), h('span', { class: 'a-note' }, ` ${t.symbol}`),
        h('p', { class: 'a-note' }, `Compra ${shortDay(t.entryDate)} a ${px(t.entry)}, stop ${px(t.open ? t.currentStop : t.stop)} · ${t.quantity} acciones` +
          (t.open ? ` · último ${px(bars.at(-1).close)}` : ` · salida ${shortDay(t.exitDate)} (${t.exitRule === 'V1' ? 'stop' : t.exitRule})`))),
      h('b', { class: (t.r ?? 0) >= 0 ? 'up' : 'down' }, rText(t.r ?? 0)));
  };
  body.append(section('Posiciones abiertas', open.length ? open.map(tradeRow) : note('Ninguna.')),
    section('Operaciones cerradas', closed.length ? closed.map(tradeRow) : note('Ninguna todavía.'),
      note('R mide cada resultado en unidades del riesgo de su operación: −1 R es perder lo previsto en el stop. Con el mismo riesgo por operación, es la comparación justa.')));
  return el;
}

// ---------- Aprender ----------

function screenAprender() {
  const card = (id, ic, title, text, tag, onclick) => h('button', { type: 'button', class: 'a-learn', id, onclick },
    h('span', { class: 'a-learn-ic' }, icon(ic)), h('span', null, h('b', null, title), tag ? h('em', null, tag) : null, h('span', { class: 'a-note' }, text)));
  return h('div', null, topBar('Aprender', 'Curso, práctica y laboratorio'),
    h('div', { class: 'a-body' },
      h('p', { class: 'a-label' }, 'Practicar'),
      card('tour-lab-card', 'flask', 'Laboratorio de reglas', 'Mueve el volumen, el RS, el cierre frente al pivot, el régimen y los resultados: el motor recalcula el veredicto en directo.', 'solo en la demo web', () => push('lab')),
      card('tour-regime-card', 'pulse', 'Régimen paso a paso', 'Un índice, cierre a cierre: días de distribución, corrección, intento de rebote y día de seguimiento.', 'solo en la demo web', () => push('regimen')),
      card('tour-replay-card', 'replay', 'Modo repetición', 'Una acción oculta, sesión a sesión. Espero, compro o vendo; al final, tú frente al método.', null, () => push('replay')),
      h('p', { class: 'a-label' }, 'El curso (en la app)'),
      section(null, h('ul', { class: 'a-course' }, [
        ['Nivel 0', 'Qué es una acción, la vela japonesa, volumen, riesgo primero'],
        ['Nivel 1', 'Las etapas del precio, plantilla de tendencia, PAVA a fondo, días de distribución y régimen, expectativa y R'],
        ['Nivel 2', 'Rango lateral y Darvas, taza con asa, banderas y HTF, RS rating, el embudo, puntuación por bloques, el plan'],
        ['Nivel 3', 'La macro que importa, sesgos del backtest, el diario, núcleo y satélite'],
      ].map(([l, t]) => h('li', null, h('b', null, l), h('span', null, t)))),
      note('85 lecciones en Markdown dentro de la app, con tests, exámenes y repaso con tarjetas. Aquí solo se listan.'))));
}

// ---------- Laboratorio de reglas ----------

const LAB_PRESETS = [
  ['De libro', { volumeRatio: 2.7, closeVsPivot: 0.014, rs: 95, regime: 0, earnings: 31 }],
  ['Sin volumen', { volumeRatio: 1.1, closeVsPivot: 0.014, rs: 95, regime: 0, earnings: 31 }],
  ['Extendido', { volumeRatio: 2.7, closeVsPivot: 0.075, rs: 95, regime: 0, earnings: 31 }],
  ['Mercado en corrección', { volumeRatio: 2.7, closeVsPivot: 0.014, rs: 95, regime: 2, earnings: 31 }],
  ['Resultados en 4 sesiones', { volumeRatio: 2.7, closeVsPivot: 0.014, rs: 95, regime: 0, earnings: 4 }],
];

function screenLab() {
  const L = S.lab;
  let prevStatus = null;
  const out = h('div', { class: 'a-lab-out' });
  const verdictBox = h('div', { class: 'a-lab-sticky', 'aria-live': 'polite', id: 'tour-lab-verdict' });
  const miniChart = h('div', { class: 'a-lab-chart' });
  const readouts = {};
  const slider = (key, label, min, max, step, fmtv, help) => {
    const id = 'lab-' + key;
    const input = h('input', { type: 'range', id, min, max, step, value: L[key], 'aria-describedby': id + '-help' });
    readouts[key] = h('output', { for: id, class: 'a-lab-val' });
    const setText = () => { readouts[key].textContent = fmtv(+input.value); input.setAttribute('aria-valuetext', fmtv(+input.value)); };
    setText();
    input.addEventListener('input', () => { L[key] = +input.value; setText(); schedule(); });
    return h('div', { class: 'a-lab-slider' }, h('div', { class: 'a-lab-sl-head' }, h('label', { for: id }, label), readouts[key]), input, h('p', { class: 'a-note', id: id + '-help' }, help));
  };
  const earnText = (v) => (v > 30 ? 'sin fecha conocida' : `en ${v} ${v === 1 ? 'sesión' : 'sesiones'}`);
  const regimeText = (v) => `${REGIME_LABEL[LAB_REGIMES[v][0]]} · ${LAB_REGIMES[v][1]} %`;
  const sliders = h('div', { class: 'a-lab-sliders', id: 'tour-lab-sliders' },
    slider('volumeRatio', 'Volumen de la rotura', 0.5, 4, 0.05, (v) => `${fmt(v, 2)}× la media`, 'PAVA pide ≥ 1,40× la media de 50 sesiones (≥ 2,00× es grado fuerte).'),
    slider('rs', 'RS rating', 50, 99, 1, (v) => String(v), 'H4 rechaza bajo 80; B2 deja en vigilancia de 80 a 89; con el mercado bajo presión hace falta 95.'),
    slider('closeVsPivot', 'Cierre frente al pivot', -0.1, 0.1, 0.002, (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v) * 100, 1)} %`, 'Rango de compra: del pivot a +5 %. Hasta −5 % es «cerca del pivot»; más abajo, dentro de la base.'),
    slider('regime', 'Régimen de mercado (exposición)', 0, 2, 1, regimeText, 'Exposición que permite el régimen: 100 %, 50 % (solo RS ≥ 95) o 0 % (sin compras nuevas).'),
    slider('earnings', 'Resultados de la empresa', 1, 31, 1, earnText, 'Sin compras nuevas en las 10 sesiones previas a resultados. Al final de la barra: fecha desconocida (aviso, no bloqueo).'));
  const presets = h('div', { class: 'a-chips', role: 'group', 'aria-label': 'Escenarios' }, LAB_PRESETS.map(([name, v]) => h('button', {
    type: 'button', class: 'a-fchip', onclick: () => {
      Object.assign(L, v);
      for (const [k, val] of Object.entries(v)) { const inp = sliders.querySelector('#lab-' + k); if (inp) { inp.value = val; inp.dispatchEvent(new Event('input')); } }
    },
  }, name)));

  let pending = false;
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; compute(); }); } }
  function compute() {
    const bars = labBars({ volumeRatio: L.volumeRatio, closeVsPivot: L.closeVsPivot });
    const a = analyze(LAB_INSTRUMENT, bars, labContext({ rs: L.rs, regime: L.regime, earnings: L.earnings > 30 ? null : L.earnings }));
    const status = Object.fromEntries(a.rules.map((r) => [r.rule, r.status + r.reason]));
    const changed = new Set(prevStatus ? a.rules.filter((r) => prevStatus[r.rule] !== status[r.rule]).map((r) => r.rule) : []);
    prevStatus = status;
    verdictBox.replaceChildren(h('div', { class: 'a-lab-verdict ' + VERDICT_CLASS[a.verdict] },
      scoreRing(a.score), h('div', null, verdictChip(a.verdict, true), h('p', null, a.headline ?? 'Cumple todas las reglas: el plan de compra se activa.'))));
    out.replaceChildren(
      gapCard(a, bars) || '',
      section('Reglas, recalculadas', ruleList(a, reduceMotion.matches ? new Set() : changed)),
      scoreCard(a));
    drawLabChart(miniChart, bars, a);
  }
  const el = h('div', null, topBar('Laboratorio de reglas', 'El motor de la app, en directo', [], back),
    h('div', { class: 'a-body' },
      note(`Una taza con asa de ejemplo (los datos de los tests del motor): pivot ${fmt(LAB_PIVOT)} $. Mueve las condiciones del cierre de hoy y el motor recalcula cada regla, la puntuación y el veredicto.`),
      miniChart, verdictBox, presets, sliders, out));
  compute();
  return el;
}

function scoreRing(score) {
  const r = 26, c = 2 * Math.PI * r;
  const share = score == null ? 0 : score / 100;
  const color = score == null ? '#3A4A60' : score >= 70 ? '#3DD68C' : score >= 50 ? '#F5A524' : '#FF8A8A';
  return svg('svg', { class: 'a-ring', viewBox: '0 0 64 64', width: 64, height: 64, role: 'img', 'aria-label': score == null ? 'Sin puntuación' : `Puntuación ${score} de 100` },
    svg('circle', { cx: 32, cy: 32, r, fill: 'none', stroke: '#243042', 'stroke-width': 6 }),
    svg('circle', { cx: 32, cy: 32, r, fill: 'none', stroke: color, 'stroke-width': 6, 'stroke-dasharray': `${(c * share).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 32 32)', 'stroke-linecap': 'round' }),
    svg('text', { x: 32, y: 37, 'text-anchor': 'middle', fill: '#E6EDF3', 'font-size': 16, 'font-weight': 600 }, score == null ? '–' : String(score)));
}

/** The lab's chart: the last 45 sessions, the pivot, the buy range, and volume against 1,4× its average. */
function drawLabChart(box, bars, a) {
  const n = 45, w = 340, hp = 130, hv = 46, gap = 8;
  const shown = bars.slice(-n);
  const avg = I.averageVolumeBefore(bars, bars.length - 1, 50);
  let lo = Math.min(...shown.map((b) => b.low)), hi = Math.max(...shown.map((b) => b.high), LAB_PIVOT * 1.06);
  lo = Math.min(lo, LAB_PIVOT * 0.88);
  const y = (v) => 6 + (hp - 12) * (1 - (v - lo) / (hi - lo));
  const bw = w / n;
  const vmax = Math.max(...shown.map((b) => b.volume), avg * 1.6);
  const vy = (v) => hp + gap + hv * (1 - v / vmax);
  const kids = [
    svg('rect', { x: 0, y: y(LAB_PIVOT * 1.05), width: w, height: y(LAB_PIVOT) - y(LAB_PIVOT * 1.05), fill: 'rgba(61,214,140,0.10)' }),
    svg('line', { x1: 0, x2: w, y1: y(LAB_PIVOT), y2: y(LAB_PIVOT), stroke: '#3DD68C', 'stroke-width': 1.5 }),
    svg('text', { x: 4, y: y(LAB_PIVOT) - 4, fill: '#3DD68C', 'font-size': 10 }, `Pivot ${fmt(LAB_PIVOT)}`),
    svg('text', { x: 4, y: y(LAB_PIVOT * 1.05) - 3, fill: '#F5A524', 'font-size': 10 }, '+5 % (fin del rango)'),
    svg('line', { x1: 0, x2: w, y1: y(LAB_PIVOT * 1.05), y2: y(LAB_PIVOT * 1.05), stroke: '#F5A524', 'stroke-width': 1, 'stroke-dasharray': '4 3' }),
  ];
  shown.forEach((b, i) => {
    const prev = i > 0 ? shown[i - 1].close : b.open;
    const up = b.close >= prev;
    const last = i === shown.length - 1;
    const col = up ? '#26A69A' : '#EF5350';
    const x = i * bw + bw / 2;
    kids.push(svg('line', { x1: x, x2: x, y1: y(b.high), y2: y(b.low), stroke: col, 'stroke-width': 1 }));
    kids.push(svg('rect', { x: x - bw * 0.32, y: Math.min(y(b.open), y(b.close)), width: bw * 0.64, height: Math.max(1, Math.abs(y(b.open) - y(b.close))), fill: col }));
    kids.push(svg('rect', { x: x - bw * 0.32, y: vy(b.volume), width: bw * 0.64, height: hp + gap + hv - vy(b.volume), fill: last ? (b.volume >= 1.4 * avg ? '#26A69A' : '#EF5350') : 'rgba(139,152,169,0.35)' }));
    if (last) kids.push(svg('rect', { x: x - bw * 0.6, y: 2, width: bw * 1.2, height: hp + gap + hv - 2, fill: 'none', stroke: '#4C8DFF', 'stroke-width': 1, rx: 2 }));
  });
  kids.push(svg('line', { x1: 0, x2: w, y1: vy(avg * 1.4), y2: vy(avg * 1.4), stroke: '#F5A524', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
  kids.push(svg('text', { x: 4, y: vy(avg * 1.4) - 3, fill: '#F5A524', 'font-size': 10 }, '1,4× media'));
  box.replaceChildren(svg('svg', { viewBox: `-2 0 ${w + 6} ${hp + gap + hv}`, class: 'a-lab-svg', role: 'img', 'aria-label': `Últimas ${n} sesiones: el cierre de hoy a ${fmt(bars.at(-1).close)} con el pivot en ${fmt(LAB_PIVOT)}` }, kids));
}

// ---------- Régimen paso a paso ----------

const MACHINE = [
  ['CONFIRMED', 'Tendencia confirmada', '100 %'], ['PRESSURE', 'Bajo presión', '50 %'], ['CORRECTION', 'En corrección', '0 %'], ['RALLY_ATTEMPT', 'Intento de rebote', '0 %'],
];
const EDGES = [
  ['CONFIRMED', 'PRESSURE', '≥ 4 días de distribución o cierre bajo la SMA50'],
  ['PRESSURE', 'CORRECTION', '≥ 6 días, o bajo una SMA50 que baja, o bajo la SMA200'],
  ['CORRECTION', 'RALLY_ATTEMPT', 'primer cierre al alza'],
  ['RALLY_ATTEMPT', 'CONFIRMED', 'día 4 o más: +1,25 % con más volumen (día de seguimiento)'],
];

function screenRegimen() {
  if (!S.regime) { const p = practiceIndex(); S.regime = { p, cursor: 232, playing: false }; }
  const R = S.regime;
  const { bars, timeline } = R.p;
  const first = timeline.findIndex((x) => x);
  const lastIdx = Math.min(bars.length - 1, 275);
  const box = h('div', { class: 'a-chart', id: 'tour-regime-chart' });
  const panel = h('div', { class: 'a-reg-panel', 'aria-live': 'polite' });
  const machine = h('div', { class: 'a-machine', role: 'img' });
  const dots = h('div', { class: 'a-dd-strip' });
  const playBtn = h('button', { type: 'button', class: 'a-btn' }, icon('play', 18), 'Reproducir');
  const prevBtn = h('button', { type: 'button', class: 'a-btn', 'aria-label': 'Sesión anterior' }, icon('prev', 18), 'Anterior');
  const nextBtn = h('button', { type: 'button', class: 'a-btn primary', 'aria-label': 'Sesión siguiente', id: 'tour-regime-next' }, 'Siguiente', icon('next', 18));
  const resetBtn = h('button', { type: 'button', class: 'a-btn text' }, 'Reiniciar');
  let chart = null;

  const update = () => {
    const t = R.cursor;
    const st = timeline[t];
    const b = bars[t], prev = bars[t - 1];
    const ch = b.close / prev.close - 1;
    const closes = bars.slice(0, t + 1).map((x) => x.close);
    const s50 = I.sma(closes, 50), s200 = I.sma(closes, 200);
    let event;
    if (st.newDistributionDay) event = `${signed(ch)} con más volumen que ayer: día de distribución.`;
    else if (ch < 0) event = `${signed(ch)} con menos volumen que ayer: no cuenta como distribución.`;
    else event = `${signed(ch)}${b.volume > prev.volume ? ' con más volumen' : ''}.`;
    panel.replaceChildren(...[
      h('div', { class: 'a-reg-top' }, regimeChip(st.state), h('b', null, `Exposición máx. ${st.state === 'CONFIRMED' ? (st.layer1Bullish ? 100 : 50) : st.state === 'PRESSURE' ? 50 : 0} %`)),
      h('p', { class: 'a-note' }, `Sesión ${t - first + 1} · ${day(b.date)} · cierre ${fmt(b.close)} · SMA50 ${fmt(s50)} · SMA200 ${fmt(s200)}`),
      h('p', null, h('b', null, 'Hoy: '), event),
      st.why ? h('p', { class: 'a-reg-why' }, h('b', null, `${REGIME_LABEL[st.from]} → ${REGIME_LABEL[st.state]}. `), st.why) : null,
      st.expired ? h('p', { class: 'a-note' }, `${st.expired} ${st.expired === 1 ? 'día de distribución caduca' : 'días de distribución caducan'} (más de 25 sesiones, o el índice ya subió un 5 % desde ellos).`) : null,
      st.rallyDay ? h('p', { class: 'a-note' }, `Día ${st.rallyDay} del intento de rebote: el día de seguimiento solo vale desde el día 4.`) : null].filter(Boolean));
    // The last 25 sessions, distribution days lit.
    const set = new Set(st.ddIndices);
    dots.replaceChildren(h('span', { class: 'a-note' }, `Días de distribución vivos: ${st.distributionDays} (en las últimas 25 sesiones)`),
      h('div', { class: 'a-dd-row', role: 'img', 'aria-label': `${st.distributionDays} días de distribución en las últimas 25 sesiones` },
        Array.from({ length: 25 }, (_, k) => h('i', { class: set.has(t - 24 + k) ? 'on' : '' }))));
    machine.setAttribute('aria-label', `Estado actual: ${REGIME_LABEL[st.state]}`);
    machine.replaceChildren(...MACHINE.map(([k, l, e], i) => h('div', { class: 'a-node' + (st.state === k ? ' on' : '') + ` n${i}` }, h('b', null, l), h('span', null, `exposición ${e}`))),
      ...EDGES.map(([from, to, text], i) => h('p', { class: `a-edge e${i}` + (st.from === from && st.state === to ? ' fired' : '') }, text)));
    prevBtn.disabled = t <= first + 5;
    nextBtn.disabled = t >= lastIdx;
    if (chart) {
      const shown = bars.slice(0, t + 1);
      const markers = [];
      for (let k = Math.max(first, t - 120); k <= t; k++) {
        const s = timeline[k];
        if (s?.newDistributionDay) markers.push({ time: bars[k].date, position: 'aboveBar', shape: 'circle', color: '#EF5350', text: 'D', size: 0.6 });
        if (s?.why && s.state === 'RALLY_ATTEMPT' && s.rallyDay === 1) markers.push({ time: bars[k].date, position: 'belowBar', shape: 'arrowUp', color: '#F5A524', text: 'Día 1' });
        if (s?.why && s.from === 'RALLY_ATTEMPT' && s.state === 'CONFIRMED') markers.push({ time: bars[k].date, position: 'belowBar', shape: 'arrowUp', color: '#3DD68C', text: 'Seguimiento' });
      }
      chart.setBars(shown, { markers, fit: false });
      chart.chart.timeScale().setVisibleLogicalRange({ from: shown.length - 70, to: shown.length + 8 });
    }
  };
  const step = (d) => { R.cursor = Math.max(first + 5, Math.min(lastIdx, R.cursor + d)); update(); };
  const stop = () => { R.playing = false; timers.forEach(clearInterval); timers = []; playBtn.replaceChildren(icon('play', 18), 'Reproducir'); };
  prevBtn.addEventListener('click', () => { stop(); step(-1); });
  nextBtn.addEventListener('click', () => { stop(); step(1); });
  resetBtn.addEventListener('click', () => { stop(); R.cursor = 232; update(); });
  playBtn.addEventListener('click', () => {
    if (R.playing) { stop(); return; }
    R.playing = true; playBtn.replaceChildren(icon('pause', 18), 'Pausa');
    timers.push(setInterval(() => { if (R.cursor >= lastIdx) stop(); else step(1); }, 650));
  });
  const el = h('div', null, topBar('Régimen paso a paso', 'La máquina de estados del régimen (v2 §3.3)', [], back),
    h('div', { class: 'a-body' },
      note('Un índice de práctica, cierre a cierre. Día de distribución: caída de al menos un 0,2 % con más volumen que la sesión anterior. Caducan a las 25 sesiones o si el índice sube un 5 % desde ellos. El estado decide cuánto se puede invertir.'),
      box, h('div', { class: 'a-controls' }, prevBtn, nextBtn, playBtn, resetBtn), panel, dots, section('La máquina', machine)));
  requestAnimationFrame(() => {
    if (chartsAvailable()) { chart = priceChart(box, bars.slice(0, R.cursor + 1), { mas: [50, 200], showRatioLine: false, visible: 70, compact: true }); charts.push(chart.chart); }
    update();
  });
  return el;
}

// ---------- Modo repetición ----------

function newReplay() {
  const d = replayData();
  return { d, cursor: d.start, pos: null, order: null, trades: [], lines: [], decisions: [], signals: [], sessionsIn: 0, finished: false, hints: false, method: null };
}

function replayNext(G) {
  const { bars } = G.d;
  const i = G.cursor + 1;
  if (i > G.d.end) return;
  const bar = bars[i];
  const closes = bars.map((b) => b.close);
  if (G.order) {
    const o = G.order;
    if (o.kind === 'BUY' && !G.pos) {
      const a = G.d.analysisAt(o.decided);
      const planStop = a.plan?.stop ?? null;
      if (planStop != null && bar.open <= planStop) {
        G.lines.push({ date: bar.date, title: 'Compra no ejecutada', body: `Abrió en ${px(bar.open)}, en el stop del plan (${px(planStop)}) o por debajo: la orden no se ejecuta.` });
      } else {
        const stop = Math.max(planStop ?? 0, bar.open * (1 - CONFIG.maxLoss));
        const size = positionSize(CAPITAL, RISK, bar.open, stop, 0.2, 1);
        const q = Math.max(1, size.quantity);
        G.pos = openPosition(bars, i, bar.open, stop, q, a.pava?.breakoutDate ? bars.findIndex((b) => b.date === a.pava.breakoutDate) : i);
        G.pos.risk = q * (bar.open - stop);
        G.lines.push({ date: bar.date, kind: 'buy', title: 'Compra a la apertura', body: `${q} acciones a ${px(bar.open)}. Stop ${px(stop)}, un ${pct(1 - stop / bar.open)} por debajo: si salta, pierdes ${money(G.pos.risk)}, que es 1 R (el ${pct(G.pos.risk / CAPITAL)} de la cuenta).` });
      }
    } else if (G.pos && (o.kind === 'SELL' || o.kind === 'HALF')) {
      const q = o.kind === 'HALF' ? Math.floor(G.pos.quantity / 2) : G.pos.quantity;
      sell(G.pos, i, bar.open, q);
      G.signals.forEach((s) => { if (!s.followed) s.followed = bar.date; });
      G.lines.push({ date: bar.date, kind: 'sell', title: o.kind === 'HALF' ? 'Venta de la mitad a la apertura' : 'Venta a la apertura', body: `${q} acciones a ${px(bar.open)}.` + (G.pos.quantity > 0 ? ` Quedan ${G.pos.quantity} con el stop en ${px(G.pos.stop)}.` : '') });
      if (G.pos.quantity <= 0) closeUserTrade(G, i, 'Decisión propia');
    }
    G.order = null;
  }
  if (G.pos && G.pos.quantity > 0) {
    const ev = stepPosition(G.pos, bars, i, closes);
    const stopEv = ev.find((e) => e.kind === 'STOP');
    if (stopEv) {
      sell(G.pos, i, stopEv.price);
      G.lines.push({ date: bar.date, kind: 'stop', title: `Salta el ${G.pos.stopKind.toLowerCase()}`, body: stopEv.gap ? `Abrió en ${px(bar.open)}, por debajo del stop: la orden salta a la apertura (hueco).` : `El mínimo de la sesión (${px(bar.low)}) tocó el stop ${px(stopEv.price)}.` });
      closeUserTrade(G, i, 'Stop');
    } else {
      for (const e of ev) {
        if (e.kind === 'SELL') { G.signals.push({ date: bar.date, rule: e.rule, partial: !!e.partial }); G.lines.push({ date: bar.date, kind: 'rule', title: `Señal de venta del método (${e.rule})`, body: `${e.text} ${e.partial ? 'Si la sigues, pulsa «Vendo la mitad».' : 'La regla vende todo: si la sigues, pulsa «Vendo».'}` }); }
        else if (e.kind === 'STOP_RAISED') G.lines.push({ date: bar.date, kind: 'info', title: 'Stop subido', body: e.text });
        else if (e.kind === 'NOTICE') G.lines.push({ date: bar.date, kind: 'info', title: `Aviso (${e.rule})`, body: e.text });
      }
    }
  }
  if (G.pos && G.pos.quantity > 0) G.sessionsIn++;
  G.cursor = i;
  if (G.cursor >= G.d.end) G.finished = true;
}

function closeUserTrade(G, i, how) {
  const p = G.pos;
  G.trades.push({ entryDate: G.d.bars[p.entryIndex].date, entry: p.entry, exitDate: G.d.bars[i].date, result: p.realized, r: p.risk > 0 ? p.realized / p.risk : 0, how, fills: p.fills, verdict: G.decisions.filter((x) => x.kind === 'BUY').at(-1)?.verdict });
  G.pos = null;
}

function replayValue(G) {
  const c = G.d.bars[G.cursor].close;
  return CAPITAL + G.trades.reduce((s, t) => s + t.result, 0) + (G.pos ? G.pos.realized + G.pos.quantity * (c - G.pos.entry) : 0);
}

function screenReplay() {
  if (!S.replay) S.replay = newReplay();
  const G = S.replay;
  if (G.finished) return replayResult(G);
  const { bars, start, end } = G.d;
  const box = h('div', { class: 'a-chart', id: 'tour-replay-chart' });
  const holding = !!G.pos;
  const a = G.d.analysisAt(G.cursor);
  const b = bars[G.cursor];
  const ch = b.close / bars[G.cursor - 1].close - 1;
  const advance = (n) => { for (let k = 0; k < n && !G.finished; k++) { const before = G.lines.length; replayNext(G); if (G.lines.length > before) break; } render(); };
  const decide = (kind) => { G.order = { kind, decided: G.cursor }; G.decisions.push({ kind, date: b.date, verdict: a.verdict, score: a.score }); advance(1); };
  const hasPartial = G.signals.some((s) => !s.followed && s.partial);
  const buttons = h('div', { class: 'a-replay-btns', id: 'tour-replay-btns' },
    h('button', { type: 'button', class: 'a-btn big', onclick: () => advance(1) }, 'Espero'),
    holding
      ? h('button', { type: 'button', class: 'a-btn big primary', onclick: () => decide('SELL') }, 'Vendo')
      : h('button', { type: 'button', class: 'a-btn big primary', onclick: () => decide('BUY') }, 'Compro'),
    holding && hasPartial ? h('button', { type: 'button', class: 'a-btn big', onclick: () => decide('HALF') }, 'Vendo la mitad') : null);
  const value = replayValue(G);
  const el = h('div', null, topBar('Modo repetición', null, [], back),
    h('div', { class: 'a-body' },
      h('h3', { class: 'a-replay-title' }, 'Acción oculta'),
      h('p', { class: 'a-note' }, `Alemania · cierre del ${day(b.date)} · ${G.cursor - start} de ${end - start} sesiones`),
      h('div', { class: 'a-meter' }, h('i', { style: `width:${((G.cursor - start) / (end - start) * 100).toFixed(1)}%` })),
      box,
      h('p', { class: 'a-note' }, `Cierre ${px(b.close)} (${signed(ch)} en la sesión). MM50 en azul y MM200 en violeta; las flechas son tus compras (debajo) y tus ventas (encima).`),
      buttons,
      h('p', { class: 'a-note' }, 'Decides con este cierre: la orden se ejecuta a la apertura de la sesión siguiente.'),
      h('div', { class: 'a-replay-wait' }, h('b', null, 'Esperar'),
        h('button', { type: 'button', class: 'a-btn text', onclick: () => advance(5) }, '5 sesiones'),
        h('button', { type: 'button', class: 'a-btn text', onclick: () => advance(20) }, '20 sesiones'),
        h('button', { type: 'button', class: 'a-btn text', onclick: () => { while (!G.finished) replayNext(G); render(false); } }, 'Hasta el final')),
      note('Se para antes si pasa algo: una compra, una venta, el stop o un aviso de las reglas.'),
      h('label', { class: 'a-switch' }, h('input', { type: 'checkbox', name: 'hints', id: 'replay-hints', checked: G.hints ? true : null, onchange: (e) => { G.hints = e.target.checked; render(); } }), ' Pista: ver el veredicto de esta tarde'),
      G.hints ? h('div', { class: 'a-hint' }, verdictChip(a.verdict), h('p', null, a.headline ?? 'Cumple todas las reglas: el método compraría a la apertura de mañana si abre dentro del rango de compra.')) : null,
      section('Tu cuenta', h('div', { class: 'a-kpis' }, kpi('Cuenta', money(value)), kpi('Desde el inicio', signed(value / CAPITAL - 1))),
        note(G.pos ? `${G.pos.quantity} acciones desde ${px(G.pos.entry)}, stop ${px(G.pos.stop)} · ${rText(((G.pos.realized + G.pos.quantity * (b.close - G.pos.entry)) / G.pos.risk))}` : 'Sin posición.')),
      G.lines.length ? section('Lo que ha pasado', h('ul', { class: 'a-log' }, G.lines.slice().reverse().map((l) => h('li', { class: l.kind || '' }, h('b', null, `${shortDay(l.date)} · ${l.title}`), h('p', null, l.body))))) : null));
  requestAnimationFrame(() => {
    if (!chartsAvailable()) return;
    const shown = bars.slice(0, G.cursor + 1);
    const c = priceChart(box, shown, { mas: [50, 200], showRatioLine: false, visible: 110, compact: true, markers: userMarkers(G) });
    charts.push(c.chart);
  });
  return el;
}

function userMarkers(G, withMethod = null) {
  const { bars } = G.d;
  const m = [];
  const fills = [...G.trades.flatMap((t) => t.fills), ...(G.pos ? G.pos.fills : [])];
  for (const f of fills) m.push({ time: bars[f.index].date, position: f.quantity > 0 ? 'belowBar' : 'aboveBar', shape: f.quantity > 0 ? 'arrowUp' : 'arrowDown', color: f.quantity > 0 ? '#3DD68C' : '#EF5350', text: 'Tú' });
  if (withMethod) for (const t of withMethod) for (const f of t.fills) m.push({ time: bars[f.index].date, position: f.quantity > 0 ? 'belowBar' : 'aboveBar', shape: 'circle', color: f.quantity > 0 ? '#38BDF8' : '#F5A524', text: 'Método' });
  return m.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
}

function replayResult(G) {
  if (!G.method) G.method = G.d.method();
  const { bars, start, end, instrument } = G.d;
  if (G.pos) { const c = bars[end].close; G.openResult = G.pos.realized + G.pos.quantity * (c - G.pos.entry); }
  const yours = [...G.trades, ...(G.pos ? [{ result: G.openResult, r: G.openResult / G.pos.risk, open: true }] : [])];
  const method = G.method;
  const side = (ts) => ({ n: ts.length, wins: ts.filter((t) => t.result > 0).length, r: ts.reduce((s, t) => s + (t.r ?? 0), 0), acc: ts.reduce((s, t) => s + t.result, 0) / CAPITAL });
  const you = side(yours), me = side(method);
  const methodIn = method.reduce((s, t) => s + ((t.exitIndex ?? end) - t.entryIndex + 1), 0);
  const hold = bars[end].close / bars[start + 1].open - 1;
  const box = h('div', { class: 'a-chart' });
  const buys = G.decisions.filter((d) => d.kind === 'BUY');
  const lessons = [];
  if (!buys.length) lessons.push('No compraste en toda la repetición. Esperar también es una decisión: el método pasa la mayoría de las tardes sin comprar.');
  else {
    lessons.push(buys.length === 1 ? `Decidiste comprar una vez, una tarde de ${VERDICT_LABEL[buys[0].verdict]}.` : `Decidiste comprar ${buys.length} veces.`);
    if (buys.some((x) => x.verdict !== 'APPROVED')) lessons.push('El método solo compra con APROBADO; las demás tardes su veredicto decía por qué esperar.');
  }
  lessons.push(method.length ? `El método compró ${method.length === 1 ? 'una vez' : method.length + ' veces'} (${method.map((t) => 'el ' + day(t.entryDate)).join(', ')}).` : 'El método no compró en estas sesiones.');
  if (G.signals.length) lessons.push(`Las reglas de venta avisaron ${G.signals.length === 1 ? 'una vez' : G.signals.length + ' veces'} mientras tenías la acción; seguiste ${G.signals.filter((s) => s.followed).length}. Con el método, esas ventas no se discuten: se ejecutan.`);
  if (G.trades.some((t) => t.how === 'Stop')) lessons.push('El stop cerró una de tus operaciones. Es su trabajo: limita la pérdida a 1 R aunque no estés mirando.');
  lessons.push('Una repetición es un solo valor durante unos meses: sirve para practicar decisiones, no para saber si el método funciona.');
  const tr = (label, a, b) => h('tr', null, h('th', { scope: 'row' }, label), h('td', null, a), h('td', null, b));
  const el = h('div', null, topBar('Resultado de la repetición', null, [], back),
    h('div', { class: 'a-body' },
      h('h3', { class: 'a-replay-title' }, `Era ${instrument.name} (${instrument.symbol})`),
      h('p', { class: 'a-note' }, `Del ${day(bars[start].date)} al ${day(bars[end].date)} · ${end - start} sesiones · Alemania · empresa ficticia`),
      section('Tú y el método, en las mismas sesiones',
        h('table', { class: 'a-table' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { scope: 'col' }, 'Tú'), h('th', { scope: 'col' }, 'El método'))),
          h('tbody', null, tr('Operaciones', String(you.n), String(me.n)), tr('Ganadoras', String(you.wins), String(me.wins)), tr('Resultado en R', rText(you.r), rText(me.r)),
            tr('Sobre la cuenta', signed(you.acc), signed(me.acc)), tr('Sesiones dentro', String(G.sessionsIn), String(methodIn)))),
        h('div', { class: 'a-kpis' }, kpi('La acción, de principio a fin', signed(hold)), kpi('Índice Alemania', signed(W.indices.IDX_DE.bars.at(-1).close / W.indices.IDX_DE.bars.at(-1 - (end - start)).close - 1))),
        note('R mide cada resultado en unidades del riesgo de su operación: con el mismo riesgo por operación es la comparación justa. Sin costes de broker en la demo.')),
      box, note('Flechas verdes y rojas: tus compras y ventas. Círculos azules y ámbar: las del método.'),
      section('Qué aprender', h('ul', { class: 'a-notes' }, lessons.map((l) => h('li', null, l)))),
      h('button', { type: 'button', class: 'a-btn primary big', onclick: () => { S.replay = newReplay(); render(false); } }, 'Jugar otra vez')));
  requestAnimationFrame(() => {
    if (!chartsAvailable()) return;
    const c = priceChart(box, bars.slice(start - 60), { mas: [50], showRatioLine: false, visible: end - start + 62, compact: true, markers: userMarkers(G, method) });
    charts.push(c.chart);
  });
  return el;
}

const SCREENS = {
  mercado: screenMercado, escaner: screenEscaner, seguimiento: screenSeguimiento, cartera: screenCartera, aprender: screenAprender,
  ficha: screenFicha, lab: screenLab, regimen: screenRegimen, replay: screenReplay,
};

// ---------- the guided tour (outside the phone, in English) ----------

const FEATURED = W.rows.find((r) => r.analysis.verdict === 'APPROVED').instrument.symbol;
const TOUR = [
  { title: 'The market comes first', target: 'tour-regime', run: () => go('mercado'),
    text: 'Before any stock, the method asks how much the market lets you invest. Each region\'s indices run a state machine over distribution days (declines on rising volume) and follow-through days. The worst state among a region\'s indices sets the exposure: 100 %, 50 % or 0 %.' },
  { title: 'The nightly scan', target: 'tour-lists', run: () => { S.scanner = { ...S.scanner, view: 'list', list: null, verdict: 'ALL', q: '' }; go('escaner'); },
    text: 'Every evening a WorkManager job runs the engine over the universe. Each row shows the verdict, RS rating, score, relative volume and where it closed against its pivot. The automatic lists (breakouts with volume, near the pivot, RS leaders) are filters on the same results. The grid icon at the top opens the heat map, a squarified treemap by sector.' },
  { title: 'A verdict, rule by rule', target: 'tour-rules', run: () => { S.ficha.tab = 'veredicto'; go('escaner'); push('ficha', { sym: FEATURED }); },
    text: 'The asset page lists every rule in the methodology\'s order: H1-H6 are structural (one failure means RECHAZADO), B1-B5 are temporary blocks (VIGILANCIA), and S is the 0-100 score. Each line carries the figures behind it. For assets that are not approved, "Qué falta para APROBADO" turns each failing rule into the condition that would clear it.' },
  { title: 'Chart and plan', target: 'tour-chart', run: () => { S.ficha.tab = 'grafico'; go('escaner'); push('ficha', { sym: FEATURED }); },
    text: 'The chart uses TradingView Lightweight Charts, as the app does: candles, the 20/50/200 averages, the pivot, the end of the buy range, the stop, and volume against its 50-day average and 1.4 times it. The Plan tab sizes the position for a 10,000 EUR account risking 0.5 % per trade, with the 50/30/20 pyramid. The Cartera tab runs the same rules as a paper account.' },
  { title: 'The rules lab', target: 'tour-lab-sliders', run: () => { go('aprender'); push('lab'); },
    text: 'The centrepiece. One cup-with-handle from the engine\'s test fixtures, with today\'s close under your control: breakout volume, RS rating, close against the pivot, market regime and days to earnings. Every change reruns the full ported engine; rules that change status flash, and the score and the verdict update.' },
  { title: 'Market regime, one day at a time', target: 'tour-regime-next', run: () => { go('aprender'); push('regimen'); },
    text: 'Step a practice index forward one close at a time. Distribution days pile up (D markers) and push the state from confirmed to under pressure to correction; the first up close starts a rally attempt, and a strong day on rising volume from day 4 is the follow-through that confirms a new uptrend.' },
  { title: 'Replay: you against the method', target: 'tour-replay-btns', run: () => { go('aprender'); push('replay'); },
    text: 'A hidden stock, session by session. Decide on each close (wait, buy or sell); orders fill at the next open, the stop is a real order, and the sell rules warn you. At the end you see your trades against the method\'s over the same sessions, in R multiples.' },
];

const tourList = document.getElementById('tour-steps');
const tourText = document.getElementById('tour-text');
const tourPrev = document.getElementById('tour-prev');
const tourNext = document.getElementById('tour-next');
const phone = document.getElementById('phone');
let step = -1;

function highlight(id) {
  document.querySelectorAll('.lp-hl').forEach((e) => e.classList.remove('lp-hl'));
  const el = id && document.getElementById(id);
  if (!el) return;
  el.classList.add('lp-hl');
  const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop - 70;
  view.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

function runStep(i) {
  step = i;
  const s = TOUR[i];
  s.run();
  tourList.querySelectorAll('button').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  tourText.replaceChildren(h('h3', null, `${i + 1}. ${s.title}`), h('p', null, s.text));
  tourPrev.disabled = i === 0;
  tourNext.disabled = i === TOUR.length - 1;
  // Charts and the heat map draw on the next frame; highlight after them.
  setTimeout(() => highlight(s.target), 120);
  // On a narrow screen the phone sits above the tour: bring it into view.
  if (window.matchMedia('(max-width: 900px)').matches) {
    const r = phone.getBoundingClientRect();
    const header = document.querySelector('.top-wrap')?.getBoundingClientRect().height || 0;
    if (r.top < header || r.top > window.innerHeight * 0.5) window.scrollTo({ top: window.scrollY + r.top - header - 8, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
}

TOUR.forEach((s, i) => tourList.append(h('li', null, h('button', { type: 'button', onclick: () => runStep(i) }, h('span', { class: 'lp-step-n' }, String(i + 1)), s.title))));
tourPrev.addEventListener('click', () => step > 0 && runStep(step - 1));
tourNext.addEventListener('click', () => runStep(Math.min(TOUR.length - 1, step + 1)));
document.getElementById('tour-reset').addEventListener('click', () => {
  S.regime = null; S.replay = null; S.lab = { volumeRatio: 2.7, closeVsPivot: 0.014, rs: 95, regime: 0, earnings: 31 };
  S.scanner = { view: 'list', list: null, verdict: 'ALL', q: '', color: 'CHANGE', scope: 'ALL', selected: null };
  step = -1; tourList.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
  tourText.replaceChildren(h('p', null, 'Pick a step to drive the phone, or tap around the app yourself.'));
  tourPrev.disabled = true; tourNext.disabled = false;
  go('mercado');
});
// Any tap inside the phone ends the highlight.
root.addEventListener('pointerdown', () => document.querySelectorAll('.lp-hl').forEach((e) => e.classList.remove('lp-hl')));

go('mercado');
document.documentElement.classList.add('lp-ready');
