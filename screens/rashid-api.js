// Rashid - thin wrapper around the real backend API. Every call is wrapped
// so that if the server isn't running, the site keeps working exactly as it
// did before (localStorage-only) - the backend is purely additive.
window.RashidApi = (function () {
    const API_BASE = 'http://localhost:4000/api';
    const APP_ID_KEY = 'rashidApplicationId';

    async function createApplication(data) {
        try {
            const res = await fetch(API_BASE + '/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) return null;
            const body = await res.json();
            if (body.application && body.application.id) {
                localStorage.setItem(APP_ID_KEY, String(body.application.id));
            }
            return body;
        } catch (e) {
            return null;
        }
    }

    function getApplicationId() {
        return localStorage.getItem(APP_ID_KEY);
    }

    // `id` is optional and defaults to the browser's own in-progress
    // application (the customer-facing wizard journey) - callers managing
    // an arbitrary advisor-side request (a specific row.id from the
    // Requests table, not necessarily "my own current application") must
    // pass it explicitly, or this would silently apply the offer to the
    // wrong record.
    async function selectOffer(offer, id) {
        const targetId = id || getApplicationId();
        if (!targetId) return null;
        try {
            const res = await fetch(API_BASE + '/applications/' + targetId + '/select-offer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(offer)
            });
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function listApplications() {
        try {
            const res = await fetch(API_BASE + '/applications');
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function getApplication(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id);
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function getCalendar(id, installment) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/calendar?installment=' + installment);
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    // Real workflow actions - each stamps a genuine timestamp/flag on the
    // application row server-side; the caller re-renders from the returned
    // application rather than assuming success.
    async function logContact(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/log-contact', { method: 'POST' });
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function sendRecommendation(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/send-recommendation', { method: 'POST' });
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function toggleReview(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/toggle-review', { method: 'POST' });
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    // Real "بانتظار العميل" / "مكتمل" advisor-triggered actions - server
    // enforces the same real preconditions as the derived status itself
    // (a recommendation must exist / an offer must be selected), so a
    // rejected response here means the action genuinely doesn't apply yet,
    // not a network failure.
    async function markAwaiting(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/mark-awaiting', { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                return { error: body.error || 'request failed' };
            }
            return await res.json();
        } catch (e) {
            return { error: 'network error' };
        }
    }

    async function closeRequest(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/close-request', { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                return { error: body.error || 'request failed' };
            }
            return await res.json();
        } catch (e) {
            return { error: 'network error' };
        }
    }

    // Issues a real decision stamp - the server enforces the real rule (an
    // offer must already be selected), so a rejected request here means the
    // caller tried to stamp an undecided application, not a network failure.
    async function issueDecisionStamp(id) {
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/issue-decision-stamp', { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                return { error: body.error || 'request failed' };
            }
            return await res.json();
        } catch (e) {
            return { error: 'network error' };
        }
    }

    return { createApplication, getApplicationId, selectOffer, listApplications, getApplication, getCalendar, logContact, sendRecommendation, toggleReview, issueDecisionStamp, markAwaiting, closeRequest };
})();
