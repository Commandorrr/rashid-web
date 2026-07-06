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

    async function selectOffer(offer) {
        const id = getApplicationId();
        if (!id) return null;
        try {
            const res = await fetch(API_BASE + '/applications/' + id + '/select-offer', {
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

    return { createApplication, getApplicationId, selectOffer, listApplications, getApplication, getCalendar };
})();
