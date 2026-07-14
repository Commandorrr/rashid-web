// Rashid - real DD/MM/YYYY confirmation for every native <input type="date">
// on the page. Native date inputs render their placeholder/format hints
// according to the browser's own OS locale, which - in an Arabic-locale
// browser on an RTL page - can render garbled (Arabic field-name words like
// "يوم"/"شهر" mixed with LTR slashes, reported directly by the user). This
// can't be reliably fixed by CSS/attributes alone across every real browser,
// so instead of replacing the native control (real risk of breaking the
// existing value/validation behavior every page already relies on), this
// adds two safe, purely-additive things: `lang="en-GB"` (the DD/MM/YYYY
// locale, in case the browser does respect it) and a small real-time text
// confirmation showing the actually-selected date in guaranteed DD/MM/YYYY
// digits, so the advisor can always trust what they picked regardless of
// how their own browser renders the native widget.
(function () {
    function formatDDMMYYYY(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        if (!m) return '';
        return m[3] + '/' + m[2] + '/' + m[1];
    }

    function enhance(input) {
        if (input.dataset.rashidDateEnhanced) return;
        input.dataset.rashidDateEnhanced = '1';
        input.setAttribute('lang', 'en-GB');

        const hint = document.createElement('div');
        hint.className = 'text-[11px] font-bold text-secondary mt-1';
        input.insertAdjacentElement('afterend', hint);

        function sync() {
            const formatted = formatDDMMYYYY(input.value);
            hint.textContent = formatted ? ('التاريخ المحدد: ' + formatted) : '';
        }
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        sync();
    }

    function enhanceAll() {
        document.querySelectorAll('input[type="date"]').forEach(enhance);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceAll);
    } else {
        enhanceAll();
    }

    // Exposed so pages that dynamically reveal a date input later (e.g. the
    // "التزامات قادمة" toggle section) can re-scan without a full reload.
    window.RashidDateFormat = { enhanceAll: enhanceAll, formatDDMMYYYY: formatDDMMYYYY };
})();
