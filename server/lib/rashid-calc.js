// Rashid backend - server-side mirror of screens/rashid-calc.js.
// Same formulas, byte-for-byte where possible, so the API never disagrees
// with what the browser already computed. Only difference: no localStorage/
// DOM access - callers pass a plain data object straight from the request body.
const PROFIT_RATE_ANNUAL = 0.0499; // representative annual profit/interest rate

function withDefaults(data) {
    return {
        name: (data && data.name) || 'عميل رشيد',
        income: (data && data.income) || 12000,
        obligations: (data && data.obligations) || 1500,
        expenses: (data && data.expenses) || 4000,
        amount: (data && data.amount) || 120000,
        tenure: (data && data.tenure) || 48,
        salaryDate: (data && data.salaryDate) || '',
        installmentDate: (data && data.installmentDate) || '',
        hasUpcomingObligation: !!(data && data.hasUpcomingObligation),
        upcomingObligationDate: (data && data.upcomingObligationDate) || '',
        upcomingObligationAmount: (data && data.upcomingObligationAmount) || 0
    };
}

function analyze(rawData) {
    const data = withDefaults(rawData);
    const upcomingMonthly = data.hasUpcomingObligation ? data.upcomingObligationAmount / 3 : 0;
    const r = PROFIT_RATE_ANNUAL / 12;
    const n = data.tenure;
    const installment = n > 0
        ? data.amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
        : data.amount;

    const totalObligations = data.obligations + installment + upcomingMonthly;
    const burdenRatio = data.income > 0 ? (totalObligations / data.income) * 100 : 100;
    const burdenCap = data.income < 15000 ? 55 : 65;
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

function dayOfMonth(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length < 2) return null;
    const day = parseInt(parts[1], 10);
    if (isNaN(day) || day < 1 || day > 30) return null;
    return day;
}

function buildCalendar(installmentAmount, rawData) {
    const data = withDefaults(rawData);
    const salaryDay = dayOfMonth(data.salaryDate);
    const installmentDay = dayOfMonth(data.installmentDate);
    const recurring = data.expenses + data.obligations;

    const days = [];
    let balance = null;
    for (let d = 1; d <= 30; d++) {
        let label = null, amount = null;
        if (d === salaryDay) {
            balance = data.income - recurring;
            label = 'salary';
            amount = data.income;
        } else if (d === installmentDay) {
            balance = (balance === null ? 0 : balance) - installmentAmount;
            label = 'installment';
            amount = installmentAmount;
        }
        days.push({ day: d, label: label, amount: amount, balance: balance });
    }
    return {
        days: days,
        salaryDay: salaryDay,
        installmentDay: installmentDay,
        recurring: recurring,
        endOfMonthBalance: days[29].balance
    };
}

module.exports = { withDefaults, analyze, estimateInstallment, alternativeOffers, buildCalendar, dayOfMonth };
