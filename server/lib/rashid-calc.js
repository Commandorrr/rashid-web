// Rashid backend - server-side mirror of screens/rashid-calc.js.
// Same formulas, byte-for-byte where possible, so the API never disagrees
// with what the browser already computed. Only difference: no localStorage/
// DOM access - callers pass a plain data object straight from the request body.
const PROFIT_RATE_ANNUAL = 0.0499; // representative annual profit/interest rate

function withDefaults(data) {
    return {
        name: (data && data.name) || 'عميل رشيد',
        customerId: (data && data.customerId) || '',
        employmentStatus: (data && data.employmentStatus) || 'موظف',
        contactChannel: (data && data.contactChannel) || '',
        requestSource: (data && data.requestSource) || 'إدخال موظف',
        financingType: (data && data.financingType) || '',
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
    const data = withDefaults(rawData);
    const upcomingMonthly = data.hasUpcomingObligation ? data.upcomingObligationAmount / 3 : 0;
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
    else if (surplus >= -data.income * 0.15) readiness = 'منخفضة';
    else readiness = 'منخفضة جداً';

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

// Unified date parser for every format these fields have ever stored: a
// native <input type="date"> ISO string ("2026-09-05"), the legacy
// manually-typed "MM/DD/YY" string, or a plain day-of-month string ("27").
function parseDateParts(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr);
    if (s.indexOf('-') !== -1) {
        const bits = s.split('-').map(n => parseInt(n, 10));
        if (bits.length < 3 || isNaN(bits[2])) return null;
        return { day: bits[2], month: bits[1], year: bits[0] };
    }
    if (s.indexOf('/') !== -1) {
        const bits = s.split('/').map(n => parseInt(n, 10));
        if (bits.length < 2 || isNaN(bits[1])) return null;
        return { day: bits[1], month: bits[0] || null, year: bits.length >= 3 ? 2000 + bits[2] : null };
    }
    const day = parseInt(s, 10);
    if (isNaN(day)) return null;
    return { day: day, month: null, year: null };
}

function dayOfMonth(dateStr) {
    const p = parseDateParts(dateStr);
    if (!p || isNaN(p.day) || p.day < 1 || p.day > 31) return null;
    return p.day;
}

function monthsFromNow(dateStr) {
    const p = parseDateParts(dateStr);
    if (!p || p.month == null || p.year == null) return 0;
    const now = new Date();
    const diff = (p.year - now.getFullYear()) * 12 + (p.month - 1 - now.getMonth());
    return Math.max(0, Math.min(2, diff));
}

function buildCalendar(installmentAmount, rawData) {
    const data = withDefaults(rawData);
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

module.exports = { withDefaults, analyze, estimateInstallment, alternativeOffers, buildCalendar, dayOfMonth };
