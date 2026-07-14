// Rashid - shared chart engine. One validated color system + one set of
// render helpers reused by every page instead of each page inventing its
// own ad hoc bar/donut colors. Palette validated with the dataviz skill's
// six-check validator against this site's surface (#fdf8f7):
//   - STATUS: CVD-separated (worst all-pairs deltaE 12.4-28), contrast
//     mitigated by always pairing color with an icon/label (never color-only).
//   - GOLD_ORDINAL: single-hue monotone-lightness ramp (all 6 checks pass)
//     so ordered buckets (tiers, funnel stages) show their order in the
//     color itself, not just in bar length.
window.RashidCharts = (function () {
    // Fixed status scale - good/warning/serious/critical, plus neutral for
    // "in progress / no verdict yet" states (distinct hue family, not part of
    // the good->critical severity axis). Never reassign per chart; every
    // readiness/pressure/decision color in the site should come from here.
    const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#2563eb' };

    // Readiness label -> status role (highest readiness = best state).
    const READINESS_STATUS = { 'عالية': 'good', 'متوسطة': 'warning', 'منخفضة': 'serious', 'منخفضة جداً': 'critical' };
    function readinessColor(label) { return STATUS[READINESS_STATUS[label]] || STATUS.warning; }

    // Fixed 4-slot nominal categorical palette (identity, not severity - use
    // for breakdowns like "primary cause" where order is arbitrary and each
    // value is its own thing, never a green->red gradient). Slot order is
    // fixed and must never be reassigned per render (validated: CVD ΔE >=12.9
    // adjacent, all >= chroma floor).
    const CATEGORICAL = ['#4a3aa7', '#e87ba4', '#1baf7a', '#92400e'];

    // Single-hue gold ramp, light->dark, for ordinal (ordered-bucket) bars:
    // funnel stages, recency buckets, count tiers. Validated with --ordinal.
    const GOLD_ORDINAL = ['#d0a952', '#b8860b', '#966d08', '#7a5306', '#5e3d05', '#453003'];
    function ordinalColor(index, total) {
        if (total <= 1) return GOLD_ORDINAL[1];
        const pos = Math.round((index / (total - 1)) * (GOLD_ORDINAL.length - 1));
        return GOLD_ORDINAL[pos];
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    let tooltipEl = null;
    function ensureTooltip() {
        if (tooltipEl) return tooltipEl;
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'rc-tooltip';
        tooltipEl.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#181512;color:#fff;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.18);opacity:0;transition:opacity .1s;white-space:nowrap;';
        document.body.appendChild(tooltipEl);
        return tooltipEl;
    }
    function showTooltip(x, y, text) {
        const t = ensureTooltip();
        t.textContent = text;
        t.style.left = x + 'px';
        t.style.top = (y - 32) + 'px';
        t.style.opacity = '1';
    }
    function hideTooltip() { if (tooltipEl) tooltipEl.style.opacity = '0'; }
    function wireHover(el, textFn) {
        el.addEventListener('mousemove', e => showTooltip(e.clientX, e.clientY, textFn()));
        el.addEventListener('mouseleave', hideTooltip);
    }

    // Renders a labelled horizontal bar list into containerId.
    // items: [{ label, value, onClick? }]
    // opts.mode: 'nominal' (one fixed color, order is meaningless - type
    //   breakdown, categories) or 'ordinal' (color steps by position - tiers,
    //   funnel, recency buckets). opts.color overrides the nominal color.
    // opts.formatValue(v) formats the trailing number; opts.suffix appends
    // after the bar's own value (e.g. " (42%)"). item.value may be null (no
    // data) - renders an empty track and, unless item.valueText is set,
    // formatValue receives null and must handle it. opts.widthMode:
    // 'relative' (default - width scaled against the max value in the list)
    // or 'absolute' (item.value is already a 0-100 score - use it as the
    // width directly, no comparison to the other rows).
    function barList(containerId, items, opts) {
        opts = opts || {};
        const mode = opts.mode || 'nominal';
        const widthMode = opts.widthMode || 'relative';
        const nominalColor = opts.color || '#755a26';
        const fmt = opts.formatValue || (v => (v || 0).toLocaleString('en-US'));
        const max = Math.max(1, ...items.map(i => i.value || 0));
        const container = document.getElementById(containerId);
        if (!container) return;
        function pctOf(v) {
            if (!v) return 0;
            const raw = widthMode === 'absolute' ? v : (v / max) * 100;
            return Math.max(3, Math.round(Math.min(100, raw)));
        }
        container.innerHTML = items.map((item, idx) => {
            const pct = pctOf(item.value);
            const color = mode === 'ordinal' ? ordinalColor(idx, items.length) : (item.color || nominalColor);
            const valueText = item.valueText !== undefined ? item.valueText : (fmt(item.value) + (opts.suffix ? opts.suffix(item) : ''));
            const Tag = item.onClick ? 'button' : 'div';
            const attrs = item.onClick ? ' type="button" data-idx="' + idx + '" class="w-full text-right rc-bar-row"' : ' class="rc-bar-row"';
            return '<' + Tag + attrs + '>' +
                '<div class="flex justify-between text-xs font-bold mb-1"><span>' + escapeHtml(item.label) + '</span><span>' + escapeHtml(valueText) + '</span></div>' +
                '<div class="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden rc-bar-track" data-value="' + item.value + '"><div class="h-full rounded-full rc-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '</' + Tag + '>';
        }).join('');
        container.querySelectorAll('.rc-bar-row').forEach((row, idx) => {
            const item = items[idx];
            const track = row.querySelector('.rc-bar-track');
            const valueText = item.valueText !== undefined ? item.valueText : (fmt(item.value) + (opts.suffix ? opts.suffix(item) : ''));
            wireHover(track, () => item.label + ': ' + valueText);
            if (item.onClick) row.addEventListener('click', () => item.onClick(item));
        });
    }

    // Renders a status donut (conic-gradient ring) + its legend.
    // segments: [{ label, count, colorRole }] where colorRole is a STATUS key.
    function statusDonut(ringId, legendId, segments, opts) {
        opts = opts || {};
        const total = segments.reduce((s, x) => s + x.count, 0);
        const ring = document.getElementById(ringId);
        const legend = document.getElementById(legendId);
        if (!ring) return;
        if (!total) { ring.style.background = '#e6e1e0'; if (legend) legend.innerHTML = ''; if (opts.onTotal) opts.onTotal(0); return; }
        let deg = 0;
        const stops = segments.filter(s => s.count > 0).map(s => {
            const from = deg; deg += (s.count / total) * 360;
            const color = STATUS[s.colorRole] || nominalFallback(s);
            return color + ' ' + from + 'deg ' + deg + 'deg';
        }).join(', ');
        const hole = opts.holePct || 62;
        ring.style.background = 'conic-gradient(' + stops + ')';
        ring.style.mask = 'radial-gradient(closest-side, transparent ' + hole + '%, black ' + (hole + 1) + '%)';
        ring.style.webkitMask = 'radial-gradient(closest-side, transparent ' + hole + '%, black ' + (hole + 1) + '%)';
        if (opts.onTotal) opts.onTotal(total);
        if (legend) {
            legend.innerHTML = segments.map(s => {
                const color = STATUS[s.colorRole] || nominalFallback(s);
                const Tag = opts.onSegmentClick ? 'button' : 'div';
                const attrs = opts.onSegmentClick ? ' type="button" data-label="' + escapeHtml(s.label) + '"' : '';
                const legendValue = opts.legendFormat ? opts.legendFormat(s.count, total, s) : String(s.count);
                const valueStyle = opts.legendValueColor ? ' style="color:' + color + '"' : '';
                return '<' + Tag + ' class="rc-legend-row flex items-center justify-between hover:bg-surface-container-highest rounded-md px-1 -mx-1 transition-colors"' + attrs + '>' +
                    '<span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:' + color + '"></span>' + escapeHtml(s.label) + '</span><span' + valueStyle + '>' + escapeHtml(legendValue) + '</span></' + Tag + '>';
            }).join('');
            if (opts.onSegmentClick) {
                legend.querySelectorAll('.rc-legend-row').forEach(btn => btn.addEventListener('click', () => opts.onSegmentClick(btn.dataset.label)));
            }
        }
    }
    function nominalFallback(s) { return s.color || '#755a26'; }

    // Vertical column chart (categories along the x-axis, value as bar
    // height) - same nominal/ordinal color rule as barList, plus hover.
    // opts.gridlinesHtml/opts.axisHtml let the caller keep its own
    // grid/y-axis markup (varies per chart) around the columns.
    function columnChart(containerId, items, opts) {
        opts = opts || {};
        const mode = opts.mode || 'nominal';
        const nominalColor = opts.color || '#755a26';
        const fmt = opts.formatValue || (v => (v || 0) + '%');
        const max = opts.max || Math.max(1, ...items.map(i => i.value || 0));
        const container = document.getElementById(containerId);
        if (!container) return;
        const barsHtml = '<div class="flex-1 flex flex-col"><div class="flex-1 flex items-end justify-around gap-2 relative">' + (opts.gridlinesHtml || '') +
            items.map((item, idx) => {
                const pct = item.value ? Math.max(2, Math.round((item.value / max) * 100)) : 0;
                const color = mode === 'ordinal' ? ordinalColor(idx, items.length) : (item.color || nominalColor);
                return '<div class="flex-1 h-full flex flex-col items-center justify-end relative z-10 rc-col" data-idx="' + idx + '"><span class="text-[11px] font-bold mb-1">' + escapeHtml(fmt(item.value)) + '</span><div class="w-full rounded-t-md rc-col-bar" style="height:' + pct + '%; background:' + color + '"></div></div>';
            }).join('') + '</div>' +
            '<div class="flex justify-around gap-2 mt-2 text-[9px] text-on-surface-variant text-center">' +
            items.map(item => '<div class="flex-1">' + escapeHtml(item.label) + '</div>').join('') + '</div></div>';
        container.innerHTML = barsHtml + (opts.axisHtml || '');
        container.querySelectorAll('.rc-col').forEach((col, idx) => {
            const item = items[idx];
            const bar = col.querySelector('.rc-col-bar');
            wireHover(bar, () => item.label + ': ' + fmt(item.value));
            if (item.onClick) { col.style.cursor = 'pointer'; col.addEventListener('click', () => item.onClick(item)); }
        });
    }

    return { STATUS, CATEGORICAL, readinessColor, ordinalColor, barList, statusDonut, columnChart };
})();
