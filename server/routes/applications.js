const express = require('express');
const db = require('../db');
const calc = require('../lib/rashid-calc');

const router = express.Router();

function rowToApplication(row) {
    return {
        id: row.id,
        name: row.name,
        customerId: row.customer_id || '',
        employmentStatus: row.employment_status || 'موظف',
        contactChannel: row.contact_channel || '',
        income: row.income,
        expenses: row.expenses,
        obligations: row.obligations,
        amount: row.amount,
        tenure: row.tenure,
        salaryDate: row.salary_date,
        installmentDate: row.installment_date,
        hasUpcomingObligation: !!row.has_upcoming_obligation,
        upcomingObligationType: row.upcoming_obligation_type || '',
        upcomingObligationDate: row.upcoming_obligation_date,
        upcomingObligationAmount: row.upcoming_obligation_amount,
        upcomingObligationRecurring: !!row.upcoming_obligation_recurring,
        createdAt: row.created_at,
        selectedOfferKey: row.selected_offer_key || null
    };
}

// Create a new wizard application and persist it.
router.post('/', (req, res) => {
    const body = req.body || {};
    if (!body.income || !body.amount || !body.tenure) {
        return res.status(400).json({ error: 'income, amount, and tenure are required' });
    }

    const stmt = db.prepare(`
        INSERT INTO applications
            (name, customer_id, employment_status, contact_channel, income, expenses, obligations, amount, tenure, salary_date, installment_date,
             has_upcoming_obligation, upcoming_obligation_type, upcoming_obligation_date, upcoming_obligation_amount, upcoming_obligation_recurring)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        body.name || 'عميل رشيد',
        body.customerId || null,
        body.employmentStatus || 'موظف',
        body.contactChannel || null,
        body.income,
        body.expenses || 0,
        body.obligations || 0,
        body.amount,
        body.tenure,
        body.salaryDate || null,
        body.installmentDate || null,
        body.hasUpcomingObligation ? 1 : 0,
        body.upcomingObligationType || null,
        body.upcomingObligationDate || null,
        body.upcomingObligationAmount || 0,
        body.upcomingObligationRecurring ? 1 : 0
    );

    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
    const application = rowToApplication(row);
    res.status(201).json({ application, analysis: calc.analyze(application) });
});

// List all applications (advisor portal), including each one's latest
// selected-offer key (if any) so the advisor overview can compute a real
// "converted to an alternative offer" rate without an N+1 query per row.
router.get('/', (req, res) => {
    const rows = db.prepare(`
        SELECT a.*, (
            SELECT so.offer_key FROM selected_offers so
            WHERE so.application_id = a.id
            ORDER BY so.created_at DESC LIMIT 1
        ) AS selected_offer_key
        FROM applications a
        ORDER BY a.created_at DESC
    `).all();
    res.json(rows.map(rowToApplication));
});

// Fetch one application plus its computed analysis and alternative offers.
router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const application = rowToApplication(row);
    res.json({
        application,
        analysis: calc.analyze(application),
        offers: calc.alternativeOffers(application)
    });
});

// Real 30-day calendar simulation for an arbitrary installment amount.
router.get('/:id/calendar', (req, res) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const installment = parseFloat(req.query.installment);
    if (isNaN(installment)) return res.status(400).json({ error: 'installment query param is required' });
    res.json(calc.buildCalendar(installment, rowToApplication(row)));
});

// Persist the offer the customer selected on the alternatives screen.
router.post('/:id/select-offer', (req, res) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });

    const { offerKey, label, amount, tenure, installment } = req.body || {};
    if (!offerKey || amount == null || tenure == null || installment == null) {
        return res.status(400).json({ error: 'offerKey, amount, tenure, and installment are required' });
    }

    const stmt = db.prepare(`
        INSERT INTO selected_offers (application_id, offer_key, label, amount, tenure, installment)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(req.params.id, offerKey, label || offerKey, amount, tenure, installment);
    const saved = db.prepare('SELECT * FROM selected_offers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(saved);
});

// Latest selected offer for an application, if any.
router.get('/:id/select-offer', (req, res) => {
    const row = db.prepare(
        'SELECT * FROM selected_offers WHERE application_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'no offer selected yet' });
    res.json(row);
});

module.exports = router;
