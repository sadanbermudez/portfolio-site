/* Charts with TradingView Lightweight Charts 5.0.9 (vendor/), styled as the app's chart.js does. */
import { Indicators as I, fmt, priceDigits, shortDay, monthName } from './engine.js';

export const THEME = {
  bg: '#0B0F14', text: '#E6EDF3', muted: '#8B98A9', grid: 'rgba(36,48,66,0.55)', border: '#243042',
  up: '#26A69A', down: '#EF5350', volUp: 'rgba(38,166,154,0.35)', volDown: 'rgba(239,83,80,0.35)', volUpHot: 'rgba(38,166,154,0.8)', volDownHot: 'rgba(239,83,80,0.8)',
  volAvg: '#F5A524', pivot: '#3DD68C', extended: '#F5A524', stop: '#EF5350', high52: '#8B98A9',
  ma20: '#8B98A9', ma50: '#4C8DFF', ma200: '#A78BFA',
};

const LWC = () => window.LightweightCharts;
/** "4 M", "850 k": volume as the app's axis writes it. */
export const compactVolume = (v) => (v >= 1e9 ? fmt(v / 1e9, 1) + ' B' : v >= 1e6 ? fmt(v / 1e6, v >= 1e7 ? 0 : 1) + ' M' : v >= 1e3 ? fmt(v / 1e3, 0) + ' k' : fmt(v, 0));
export const chartsAvailable = () => !!window.LightweightCharts;

export function makeChart(el, { digits = 2, volume = true, compact = false } = {}) {
  const L = LWC();
  const chart = L.createChart(el, {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: THEME.bg }, textColor: THEME.muted, fontSize: compact ? 10 : 11,
      // The logo injects a <style> element, which the site's CSP forbids: the page credits TradingView with a link instead.
      fontFamily: 'Roboto, "Segoe UI", system-ui, sans-serif', attributionLogo: false,
      panes: { separatorColor: THEME.border, separatorHoverColor: THEME.border, enableResize: false },
    },
    grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
    rightPriceScale: { borderColor: THEME.border, scaleMargins: { top: 0.1, bottom: 0.06 } },
    timeScale: {
      borderColor: THEME.border, rightOffset: 4, barSpacing: compact ? 4 : 5, minBarSpacing: 1,
      tickMarkFormatter: (t, type) => {
        const iso = typeof t === 'string' ? t : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
        return type === 0 ? iso.slice(0, 4) : type === 1 ? monthName(iso) : String(+iso.slice(8, 10));
      },
    },
    crosshair: {
      mode: L.CrosshairMode.Normal,
      vertLine: { color: THEME.muted, labelBackgroundColor: THEME.border, style: L.LineStyle.Dashed },
      horzLine: { color: THEME.muted, labelBackgroundColor: THEME.border, style: L.LineStyle.Dashed },
    },
    localization: {
      locale: 'es-ES',
      timeFormatter: (t) => (typeof t === 'string' ? shortDay(t) : ''),
    },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
  });
  return chart;
}

const line = (chart, color, width = 2, pane = 0, extra = {}) => chart.addSeries(LWC().LineSeries, {
  color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra,
}, pane);

function seriesOf(bars, values) { return bars.map((b, i) => (values[i] == null ? { time: b.date } : { time: b.date, value: values[i] })); }

/**
 * Candles with SMA 20/50/200, the volume pane with its 50-session average and 1.4 times it, and
 * the plan's levels as price lines (pivot, extended, stop, 52-week high). [upTo] hides the future.
 */
export function priceChart(el, bars, { pivot = null, stop = null, high52 = null, markers = [], mas = [20, 50, 200], showRatioLine = true, legend = null, visible = 110, compact = false } = {}) {
  const L = LWC();
  const digits = priceDigits(bars[bars.length - 1].close);
  const chart = makeChart(el, { digits, compact });
  const priceFmt = { type: 'custom', minMove: 10 ** -digits, formatter: (p) => fmt(p, digits) };
  const candles = chart.addSeries(L.CandlestickSeries, {
    priceFormat: priceFmt,
    upColor: THEME.up, downColor: THEME.down, borderUpColor: THEME.up, borderDownColor: THEME.down, wickUpColor: THEME.up, wickDownColor: THEME.down,
    priceLineVisible: false,
  });
  const api = { chart, candles, maSeries: {}, mas };
  // In the small charts a far-away average must not flatten the candles: it leaves the autoscale.
  for (const n of mas) api.maSeries[n] = line(chart, THEME['ma' + n], n === 20 ? 1 : 2, 0, { priceFormat: priceFmt, ...(compact ? { autoscaleInfoProvider: () => null } : {}) });
  const volFmt = { type: 'custom', minMove: 1, formatter: compactVolume };
  const vol = chart.addSeries(L.HistogramSeries, { priceFormat: volFmt, lastValueVisible: false, priceLineVisible: false }, 1);
  const avg = line(chart, THEME.volAvg, 1, 1, { priceFormat: volFmt });
  const avg14 = showRatioLine ? line(chart, THEME.volAvg, 1, 1, { lineStyle: L.LineStyle.Dashed, priceFormat: volFmt }) : null;
  try { chart.panes()[1].setHeight(compact ? 60 : 80); } catch { /* older pane API */ }
  chart.priceScale('right', 1).applyOptions({ borderColor: THEME.border, scaleMargins: { top: 0.15, bottom: 0 } });
  api.markersApi = L.createSeriesMarkers(candles, []);

  api.setBars = (shown, opts = {}) => {
    const closes = shown.map((b) => b.close);
    candles.setData(shown.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));
    for (const n of mas) api.maSeries[n].setData(seriesOf(shown, I.smaSeries(closes, n)));
    const va = shown.map((b, i) => I.averageVolumeBefore(shown, i, 50));
    vol.setData(shown.map((b, i) => {
      const prevClose = i > 0 ? shown[i - 1].close : b.open;
      const hot = va[i] && b.volume >= 1.4 * va[i];
      const upDay = b.close >= prevClose;
      return { time: b.date, value: b.volume, color: upDay ? (hot ? THEME.volUpHot : THEME.volUp) : (hot ? THEME.volDownHot : THEME.volDown) };
    }));
    avg.setData(seriesOf(shown, va));
    if (avg14) avg14.setData(seriesOf(shown, va.map((v) => (v == null ? null : v * 1.4))));
    api.markersApi.setMarkers(opts.markers || []);
    if (opts.fit !== false) {
      const n = shown.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - visible), to: n + 10 });
    }
  };
  api.lines = [];
  api.setLevels = (levels) => {
    api.lines.forEach((pl) => candles.removePriceLine(pl));
    api.lines = levels.filter((l) => l.price != null).map((l) => candles.createPriceLine({ price: l.price, color: l.color, lineWidth: l.width || 1, lineStyle: l.style ?? L.LineStyle.Solid, axisLabelVisible: true, title: l.title }));
  };
  api.setBars(bars, { markers });
  api.setLevels([
    { price: high52, color: THEME.high52, title: 'Máx. 52s', style: L.LineStyle.Dotted },
    { price: pivot, color: THEME.pivot, title: 'Compra', width: 2 },
    { price: pivot != null ? pivot * 1.05 : null, color: THEME.extended, title: 'Ext.', style: L.LineStyle.Dashed },
    { price: stop, color: THEME.stop, title: 'Stop', width: 2, style: L.LineStyle.Dashed },
  ]);

  if (legend) {
    const show = (i) => {
      const b = bars[i]; if (!b) return;
      const prev = i > 0 ? bars[i - 1].close : b.open;
      const ch = b.close / prev - 1;
      const va = I.averageVolumeBefore(bars, i, 50);
      const closes = bars.map((x) => x.close);
      legend.ohlc.textContent = `${shortDay(b.date)}  A ${fmt(b.open, digits)}  M ${fmt(b.high, digits)}  m ${fmt(b.low, digits)}  C ${fmt(b.close, digits)}  ${ch >= 0 ? '+' : '−'}${fmt(Math.abs(ch) * 100, 2)} %`;
      legend.ohlc.className = 'a-legend-ohlc ' + (ch >= 0 ? 'up' : 'down');
      legend.vol.textContent = `Vol ${fmt(b.volume / 1e6, 2)} M` + (va ? ` · ${fmt(b.volume / va, 2)}× media` : '');
      legend.mas.textContent = mas.map((n) => { const v = I.sma(closes, n, i); return v == null ? null : `MM${n} ${fmt(v, digits)}`; }).filter(Boolean).join('  ');
    };
    show(bars.length - 1);
    const idx = new Map(bars.map((b, i) => [b.date, i]));
    chart.subscribeCrosshairMove((p) => { const t = typeof p.time === 'string' ? p.time : null; show(t && idx.has(t) ? idx.get(t) : bars.length - 1); });
  }
  return api;
}

export function lineChart(el, seriesList, { digits = 0, percent = false } = {}) {
  const chart = makeChart(el, { digits, volume: false, compact: true });
  chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.15, bottom: 0.1 } } });
  const priceFormat = { type: 'custom', minMove: 10 ** -digits, formatter: (p) => fmt(p, digits) + (percent ? ' %' : '') };
  for (const s of seriesList) {
    const ser = line(chart, s.color, s.width || 2, 0, { priceFormat, lineStyle: s.dashed ? LWC().LineStyle.Dashed : LWC().LineStyle.Solid, lastValueVisible: true, title: s.title || '' });
    ser.setData(s.data.map((p) => ({ time: p.date, value: p.value })));
  }
  chart.timeScale().fitContent();
  return chart;
}
