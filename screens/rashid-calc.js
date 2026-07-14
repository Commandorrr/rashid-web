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
        const recurringPill = document.querySelector('#rashid-upcoming-recurring-pills .rashid-pill[data-active="true"]');
        // "يوم الاستحقاق" is a real <input type="date"> (native calendar
        // picker, ISO "YYYY-MM-DD" value) so it directly carries the real
        // month/year rashid needs - no more deriving it from a separate
        // "starts after" choice. dayOfMonth()/monthsFromNow() parse this
        // format directly (see below).
        const upcomingObligationDate = str('rashid-upcoming-day') || str('rashid-upcoming-date');

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
            requestSource: str('rashid-request-source') || 'إدخال موظف',
            financingType: str('rashid-financing-type'),
            savedAt: new Date().toISOString()
        };
    }

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
        else if (surplus >= -data.income * 0.15) readiness = 'منخفضة';
        else readiness = 'منخفضة جداً';

        let decision, recommendation;
        if (eligible) {
            decision = 'مؤهل';
            recommendation = 'وضعك المالي يسمح بهذا التمويل ضمن الحدود الآمنة المعتمدة من قبل رشيد.';
        } else if (marginal) {
            decision = 'مؤهل بشروط';
            recommendation = 'يفضل اختيار العرض المناسب لتسهيل وضعك المالي.';
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

    // rateAnnual defaults to the fixed representative rate, but callers that
    // know the real per-application "هامش ربح تقديري" (profitRateAnnual)
    // should pass it explicitly - alternativeOffers() does, below, so the
    // offer comparisons genuinely reflect whatever rate the advisor entered
    // on بياناتك المالية instead of silently ignoring it.
    function estimateInstallment(amount, tenureMonths, rateAnnual) {
        const r = (rateAnnual != null ? rateAnnual : PROFIT_RATE_ANNUAL) / 12;
        const n = tenureMonths;
        if (n <= 0) return amount;
        return amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    }

    function alternativeOffers(rawData) {
        const result = analyze(rawData);
        const baseAmount = result.input.amount;
        const baseTenure = result.input.tenure;
        const income = result.input.income;
        const rateAnnual = result.input.profitRateAnnual;

        const build = (amount, tenure) => {
            const installment = estimateInstallment(amount, tenure, rateAnnual);
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

    // Unified date parser for every format this app has ever stored in these
    // fields: a native <input type="date"> ISO string ("2026-09-05"), the
    // legacy manually-typed "MM/DD/YY" string, or a plain day-of-month string
    // ("27" - salary/installment day are recurring-every-month, so a real
    // month/year was never meaningful for those two fields). Old
    // localStorage/DB rows keep parsing correctly under any of the three.
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

    // How many whole months from today a date falls in (clamped to the 0-2
    // window this 90-day simulation covers), used to place the upcoming
    // obligation in the correct simulated month.
    function monthsFromNow(dateStr) {
        const p = parseDateParts(dateStr);
        if (!p || p.month == null || p.year == null) return 0;
        const now = new Date();
        const diff = (p.year - now.getFullYear()) * 12 + (p.month - 1 - now.getMonth());
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
    // across every advisor page - the single source of truth for pressure
    // banding (0-35 منخفضة / 36-60 متوسطة / 61-80 مرتفعة / 81-100 مرتفعة جداً).
    // Every page must call this rather than defining its own thresholds.
    function pressureTier(score) {
        if (score <= 35) return 'منخفضة';
        if (score <= 60) return 'متوسطة';
        if (score <= 80) return 'مرتفعة';
        return 'مرتفعة جداً';
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

    // Single source of truth for an application's operational status - every
    // page that shows a "حالة الطلب" badge must call this, never define a
    // local copy (a past bug was exactly two pages silently disagreeing).
    // All 8 states trace to real stored signals/timestamps only:
    //   - customerId/contactChannel presence (real optional profile fields)
    //   - needsReview (real advisor-set flag)
    //   - selectedOfferKey/selectedOfferAt (real offer-selection event+time)
    //   - recommendationSentAt (real timestamp)
    //   - lastContactAt (real timestamp)
    //   - eligible (real analyze() output)
    //   - createdAt (real submission time)
    //   - awaitingMarkedAt/closedAt (real advisor-triggered "mark as
    //     awaiting"/"close file" actions - same precedent as needsReview)
    // Where the spec called for two states that only differ by "how fresh is
    // this event" (e.g. تم اختيار العرض vs مكتمل, تم إرسال التوصية vs
    // بانتظار العميل, جديد vs تم التحليل), a real 24h age threshold on the
    // real timestamp is used to split them, OR the advisor's own explicit
    // awaitingMarkedAt/closedAt action - never a fabricated distinction.
    function statusOf(row, result) {
        const a = result || analyze(row);
        const hoursSince = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity;

        if (!row.customerId && !row.contactChannel) {
            return { key: 'بيانات ناقصة', dot: '#e11d48', badgeBg: '#fbe0e4', badgeText: '#e11d48', nextAction: 'استكمال البيانات' };
        }
        if (row.needsReview) {
            return { key: 'محوّل للمراجعة', dot: '#92702f', badgeBg: '#f3ecdd', badgeText: '#92702f', nextAction: 'مراجعة إضافية' };
        }
        if (row.selectedOfferKey) {
            // مكتمل is reached either by the natural 24h elapse, or by the
            // advisor honestly closing the file now via closedAt (a real
            // stamped action, not a fabricated status string).
            if (row.closedAt || hoursSince(row.selectedOfferAt) > 24) {
                return { key: 'مكتمل', dot: '#15803d', badgeBg: '#dcefdf', badgeText: '#15803d', nextAction: '-' };
            }
            return { key: 'تم اختيار العرض', dot: '#22c55e', badgeBg: '#e2f7e8', badgeText: '#22c55e', nextAction: 'إغلاق الملف' };
        }
        if (row.recommendationSentAt) {
            // Same idea for بانتظار العميل: natural 24h elapse, or the
            // advisor honestly marking it now via awaitingMarkedAt.
            if (row.awaitingMarkedAt || hoursSince(row.recommendationSentAt) > 24) {
                return { key: 'بانتظار العميل', dot: '#7c3aed', badgeBg: '#ede4fc', badgeText: '#7c3aed', nextAction: 'تذكير العميل' };
            }
            return { key: 'تم إرسال التوصية', dot: '#0ea5e9', badgeBg: '#e3f4fd', badgeText: '#0ea5e9', nextAction: 'متابعة الرد' };
        }
        if (!a.eligible && !row.lastContactAt) {
            return { key: 'بحاجة تواصل', dot: '#ea580c', badgeBg: '#fdecd8', badgeText: '#ea580c', nextAction: 'التواصل اليوم' };
        }
        if (hoursSince(row.createdAt) > 24) {
            return { key: 'تم التحليل', dot: '#0d9488', badgeBg: '#e0f5f2', badgeText: '#0d9488', nextAction: 'بدء التواصل' };
        }
        return { key: 'جديد', dot: '#2563eb', badgeBg: '#e8f0ff', badgeText: '#2563eb', nextAction: 'مراجعة أولية' };
    }

    // Real "before vs after" comparison for a request that has a genuine
    // selectedOfferKey: "before" is the analysis of the original submitted
    // amount/tenure, "after" is the analysis of whichever real offer terms
    // (amount+tenure from alternativeOffers()) the customer/advisor actually
    // selected - including "current" (kept the original terms after seeing
    // alternatives). Returns null when no real offer has been selected yet,
    // so callers never fabricate an "after" state for an undecided request.
    // Used across the التحليلات tabs (نظرة عامة / أثر البدائل) to power every
    // before/after pressure or remaining-balance metric from one real source.
    const OFFER_LABELS = { current: 'الاستمرار بالطلب الأصلي', balanced: 'العرض المتوازن', safe: 'العرض الآمن', smart: 'العرض الذكي' };
    function offerImpactFor(row) {
        if (!row.selectedOfferKey) return null;
        const offers = alternativeOffers(row);
        const offer = offers[row.selectedOfferKey];
        if (!offer) return null;
        const before = analyze(row);
        const after = analyze(Object.assign({}, row, { amount: offer.amount, tenure: offer.tenure }));
        return { key: row.selectedOfferKey, label: OFFER_LABELS[row.selectedOfferKey] || row.selectedOfferKey, offer, before, after };
    }

    return { save, load, collectFromForm, analyze, estimateInstallment, alternativeOffers, buildCalendar, dayOfMonth, pressureTier, primaryPressureCause, statusOf, offerImpactFor, OFFER_LABELS, STORAGE_KEY };
})();
