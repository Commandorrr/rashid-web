// Rashid - shared client-side "backend": collects the wizard input,
// stores it, and runs a real debt-burden-ratio (DBR) style affordability
// calculation against it (approximating SAMA's DBR cap rules), instead of
// showing static demo numbers regardless of what the user typed.
window.RashidCalc = (function () {
    const STORAGE_KEY = 'rashidApplication';
    const PROFIT_RATE_ANNUAL = 0.0499; // representative annual profit/interest rate

    function save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function collectFromForm() {
        const num = (id) => {
            const el = document.getElementById(id);
            const v = el ? parseFloat(el.value) : NaN;
            return isNaN(v) || v < 0 ? 0 : v;
        };
        const str = (id) => {
            const el = document.getElementById(id);
            return el && el.value ? el.value.trim() : '';
        };
        const hasUpcomingEl = document.getElementById('rashid-has-upcoming');

        // The wizard asks "starts after: شهر/شهرين/3 أشهر" (a pill group) and a
        // plain "due day" number rather than making the customer type/guess a
        // full future date - both of those are exactly what buildCalendar()
        // needs anyway (a month offset + a day-of-month), so this synthesizes
        // a real "MM/DD/YY" string from today's actual date so the existing
        // dayOfMonth()/monthsFromNow() parsers keep working unchanged. Falls
        // back to reading a raw #rashid-upcoming-date field if a page still
        // uses the older single-date-input markup.
        const startsPill = document.querySelector('#rashid-upcoming-starts-pills .rashid-pill[data-active="true"]');
        const recurringPill = document.querySelector('#rashid-upcoming-recurring-pills .rashid-pill[data-active="true"]');
        let upcomingObligationDate = str('rashid-upcoming-date');
        const upcomingDay = num('rashid-upcoming-day');
        if (!upcomingObligationDate && startsPill && upcomingDay) {
            const monthsAhead = parseInt(startsPill.dataset.value, 10) || 1;
            const target = new Date();
            target.setDate(1); // avoid month-end overflow before adding months
            target.setMonth(target.getMonth() + monthsAhead);
            const mm = String(target.getMonth() + 1).padStart(2, '0');
            const yy = String(target.getFullYear() % 100).padStart(2, '0');
            const dd = String(Math.min(31, upcomingDay)).padStart(2, '0');
            upcomingObligationDate = mm + '/' + dd + '/' + yy;
        }

        return {
            name: str('rashid-name'),
            customerId: str('rashid-customer-id'),
            employmentStatus: str('rashid-employment-status'),
            contactChannel: str('rashid-contact-channel'),
            income: num('rashid-income'),
            obligations: num('rashid-obligations'),
            expenses: num('rashid-expenses'),
            amount: num('rashid-amount'),
            tenure: parseInt(str('rashid-tenure'), 10) || 0,
            profitRateAnnual: document.getElementById('rashid-profit-rate') ? num('rashid-profit-rate') / 100 : null,
            salaryDate: str('rashid-salary-date'),
            installmentDate: str('rashid-installment-date'),
            hasUpcomingObligation: !!(hasUpcomingEl && hasUpcomingEl.checked),
            upcomingObligationType: str('rashid-upcoming-type'),
            upcomingObligationDate: upcomingObligationDate,
            upcomingObligationAmount: num('rashid-upcoming-amount'),
            upcomingObligationRecurring: recurringPill ? recurringPill.dataset.value === 'شهري' : false,
            savedAt: new Date().toISOString()
        };
    }

    function withDefaults(data) {
        return {
            name: (data && data.name) || 'عميل رشيد',
            customerId: (data && data.customerId) || '',
            employmentStatus: (data && data.employmentStatus) || 'موظف',
            contactChannel: (data && data.contactChannel) || '',
            income: (data && data.income) || 12000,
            obligations: (data && data.obligations) || 1500,
            expenses: (data && data.expenses) || 4000,
            amount: (data && data.amount) || 120000,
            tenure: (data && data.tenure) || 48,
            profitRateAnnual: (data && data.profitRateAnnual) || PROFIT_RATE_ANNUAL,
            salaryDate: (data && data.salaryDate) || '',
            installmentDate: (data && data.installmentDate) || '',
            hasUpcomingObligation: !!(data && data.hasUpcomingObligation),
            upcomingObligationType: (data && data.upcomingObligationType) || '',
            upcomingObligationDate: (data && data.upcomingObligationDate) || '',
            upcomingObligationAmount: (data && data.upcomingObligationAmount) || 0,
            upcomingObligationRecurring: !!(data && data.upcomingObligationRecurring)
        };
    }

    function analyze(rawData) {
        const data = withDefaults(rawData || load());
        // An upcoming one-off obligation is smoothed over 3 months into the
        // monthly burden calculation, since that's the window the wizard asks about.
        const upcomingMonthly = data.hasUpcomingObligation ? data.upcomingObligationAmount / 3 : 0;
        // An advisor-adjustable estimated profit rate (from the "هامش ربح
        // تقديري" field) only affects this application's own installment/DBR
        // figures - it's explicitly advisory, never a final institutional
        // price, so alternativeOffers()/estimateInstallment() intentionally
        // keep using the fixed representative rate for the offer comparisons.
        const r = data.profitRateAnnual / 12;
        const n = data.tenure;
        const installment = n > 0
            ? data.amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
            : data.amount;

        const totalObligations = data.obligations + installment + upcomingMonthly;
        const burdenRatio = data.income > 0 ? (totalObligations / data.income) * 100 : 100;
        // Retired customers get a stricter cap: pension income is fixed with no
        // growth/promotion upside, so Rashid applies a more conservative ceiling
        // than for salaried employees, in line with standard conservative-lending practice.
        const isRetired = data.employmentStatus === 'متقاعد';
        const baseCap = data.income < 15000 ? 55 : 65;
        const burdenCap = isRetired ? baseCap - 5 : baseCap;
        const surplus = data.income - data.expenses - totalObligations;

        const pressureScore = Math.max(0, Math.min(100, Math.round(burdenRatio * 1.15)));
        const eligible = burdenRatio <= burdenCap && surplus >= 0;
        const marginal = !eligible && burdenRatio <= burdenCap + 10;
        const confidence = Math.max(35, Math.min(97, Math.round(100 - Math.max(0, burdenRatio - 20) * 0.9)));

        let readiness;
        if (surplus > data.income * 0.2) readiness = 'مرتفعة';
        else if (surplus >= 0) readiness = 'متوسطة';
        else readiness = 'منخفضة';

        let decision, recommendation;
        if (eligible) {
            decision = 'مؤهل';
            recommendation = 'وضعك المالي يسمح بهذا التمويل ضمن الحدود الآمنة المعتمدة من قبل رشيد.';
        } else if (marginal) {
            decision = 'مؤهل بشروط';
            recommendation = 'يمكنك الحصول على التمويل، لكن يُفضّل تخفيض المبلغ المطلوب أو زيادة مدة السداد لتحسين وضعك المالي.';
        } else {
            decision = 'غير مؤهل حالياً';
            recommendation = 'نسبة الاستقطاع الشهري المتوقعة تتجاوز الحد الآمن. جرّب تقليل مبلغ التمويل أو زيادة مدة السداد من صفحة "بياناتك".';
        }

        return {
            input: data,
            installment: Math.round(installment),
            totalObligations: Math.round(totalObligations),
            burdenRatio: Math.round(burdenRatio * 10) / 10,
            burdenCap,
            isRetired,
            surplus: Math.round(surplus),
            pressureScore,
            eligible,
            marginal,
            confidence,
            readiness,
            decision,
            recommendation
        };
    }

    function estimateInstallment(amount, tenureMonths) {
        const r = PROFIT_RATE_ANNUAL / 12;
        const n = tenureMonths;
        if (n <= 0) return amount;
        return amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    }

    function alternativeOffers(rawData) {
        const result = analyze(rawData);
        const baseAmount = result.input.amount;
        const baseTenure = result.input.tenure;
        const income = result.input.income;

        const build = (amount, tenure) => {
            const installment = estimateInstallment(amount, tenure);
            const burden = income > 0 ? (installment / income) * 100 : 0;
            return {
                amount: Math.round(amount),
                tenure,
                installment: Math.round(installment),
                burdenPct: Math.max(1, Math.min(100, Math.round(burden)))
            };
        };

        return {
            current: build(baseAmount, baseTenure),
            balanced: build(baseAmount * 0.83, baseTenure),
            safe: build(baseAmount * 0.7, Math.min(60, baseTenure + 24)),
            smart: build(baseAmount * 0.79, baseTenure)
        };
    }

    // Accepts either a plain day-of-month string ("27" - the wizard's current
    // salary/first-installment day inputs, since those recur every month and
    // never needed a real month/year) or a legacy "MM/DD/YY" string, so old
    // localStorage/DB data saved before that field simplified still parses.
    function dayOfMonth(dateStr) {
        if (!dateStr) return null;
        const parts = String(dateStr).split('/');
        const day = parts.length >= 2 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
        if (isNaN(day) || day < 1 || day > 31) return null;
        return day;
    }

    // How many whole months from today a MM/DD/YY date falls in (clamped to
    // the 0-2 window this 90-day simulation covers), used to place the
    // upcoming obligation in the correct simulated month.
    function monthsFromNow(dateStr) {
        if (!dateStr) return 0;
        const parts = dateStr.split('/');
        if (parts.length < 3) return 0;
        const month = parseInt(parts[0], 10);
        const year = parseInt(parts[2], 10) + 2000;
        if (isNaN(month) || isNaN(year)) return 0;
        const now = new Date();
        const diff = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
        return Math.max(0, Math.min(2, diff));
    }

    // Builds a real day-by-day cash position: salary lands on the customer's
    // actual salary day, the chosen installment hits on their actual
    // first-installment day, and the running balance carries forward between
    // events. Simulates 30 days normally, or a real 90-day/3-month window
    // (repeating the monthly salary/recurring cycle) when the customer has
    // an upcoming obligation within the next 3 months, placing that
    // obligation as a real dated event in whichever simulated month it falls.
    function buildCalendar(installmentAmount, rawData) {
        const data = withDefaults(rawData || load());
        const totalDays = data.hasUpcomingObligation ? 90 : 30;
        const salaryDay = dayOfMonth(data.salaryDate);
        const installmentDay = dayOfMonth(data.installmentDate);
        const recurring = data.expenses + data.obligations;
        const upcomingDay = data.hasUpcomingObligation ? dayOfMonth(data.upcomingObligationDate) : null;
        const upcomingMonthOffset = data.hasUpcomingObligation ? monthsFromNow(data.upcomingObligationDate) : null;

        const days = [];
        let balance = null;
        for (let d = 1; d <= totalDays; d++) {
            const dayOfCycle = ((d - 1) % 30) + 1;
            const monthOffset = Math.floor((d - 1) / 30);
            let label = null, amount = null;
            if (dayOfCycle === salaryDay) {
                balance = (balance === null ? 0 : balance) + data.income - recurring;
                label = 'salary';
                amount = data.income;
            } else if (dayOfCycle === installmentDay) {
                balance = (balance === null ? 0 : balance) - installmentAmount;
                label = 'installment';
                amount = installmentAmount;
            } else if (upcomingDay !== null && dayOfCycle === upcomingDay && (data.upcomingObligationRecurring ? monthOffset >= upcomingMonthOffset : monthOffset === upcomingMonthOffset)) {
                balance = (balance === null ? 0 : balance) - data.upcomingObligationAmount;
                label = 'upcoming';
                amount = data.upcomingObligationAmount;
            }
            days.push({ day: d, label: label, amount: amount, balance: balance });
        }
        return {
            days: days,
            totalDays: totalDays,
            salaryDay: salaryDay,
            installmentDay: installmentDay,
            upcomingDay: upcomingDay,
            upcomingMonthOffset: upcomingMonthOffset,
            recurring: recurring,
            endOfMonthBalance: days[days.length - 1].balance
        };
    }

    // Groups a pressureScore (0-100) into the 4 real severity tiers used
    // across the advisor analytics pages.
    function pressureTier(score) {
        if (score >= 75) return 'حرجة';
        if (score >= 50) return 'مرتفعة';
        if (score >= 25) return 'متوسطة';
        return 'منخفضة';
    }

    // Determines the single biggest real driver of an application's pressure
    // score by comparing normalized contributions - used to power the
    // "أبرز أسباب الضغط" charts/rankings on the analytics pages. Every
    // candidate is derived from real fields (income/obligations/installment/
    // upcoming obligation), never a fabricated category.
    function primaryPressureCause(rawData, result) {
        const data = withDefaults(rawData);
        const r = result || analyze(data);
        const income = data.income > 0 ? data.income : 1;
        const installmentRatio = r.installment / income;
        const obligationsRatio = data.obligations / income;
        const marginShortfall = r.surplus / income < 0.1 ? (0.5 - r.surplus / income) : 0;
        const upcomingRatio = data.hasUpcomingObligation ? (data.upcomingObligationAmount / income) : 0;

        const candidates = [
            { key: 'نسبة القسط للدخل مرتفعة', value: installmentRatio },
            { key: 'ارتفاع الالتزامات الحالية', value: obligationsRatio },
            { key: 'انخفاض الهامش المتبقي', value: marginShortfall },
            { key: 'التزام قادم خلال 3 أشهر', value: upcomingRatio }
        ];
        candidates.sort((a, b) => b.value - a.value);
        return candidates[0].key;
    }

    return { save, load, collectFromForm, analyze, estimateInstallment, alternativeOffers, buildCalendar, dayOfMonth, pressureTier, primaryPressureCause, STORAGE_KEY };
})();
