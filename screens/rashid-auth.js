// Rashid - shared bank-employee auth state. `login`/`logout`/`isLoggedIn`/
// `getSession` are unchanged local-storage helpers (kept as-is so nothing
// that already calls them breaks). `loginRemote` is additive: it verifies
// the credentials against the real backend (bcrypt-hashed accounts in
// SQLite) and only falls back to local-only login if the API is
// unreachable, so the login button keeps working even with the server off.
window.RashidAuth = (function () {
    const KEY = 'rashidEmployeeAuth';
    const API_BASE = 'http://localhost:4000/api';

    function getSession() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function isLoggedIn() {
        return !!getSession();
    }

    function login(username) {
        const session = { username: username, loggedInAt: new Date().toISOString() };
        localStorage.setItem(KEY, JSON.stringify(session));
        return session;
    }

    function logout() {
        localStorage.removeItem(KEY);
    }

    async function postJson(path, body) {
        return fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    // Verifies username/password against the real backend. If the account
    // doesn't exist yet, registers it on the spot (this demo has no separate
    // sign-up screen). If the API can't be reached at all, keeps the site
    // working exactly as before by logging in locally only.
    async function loginRemote(username, password) {
        try {
            let res = await postJson('/auth/login', { username, password });
            if (res.status === 401) {
                const reg = await postJson('/auth/register', { username, password });
                if (reg.ok || reg.status === 409) {
                    res = await postJson('/auth/login', { username, password });
                }
            }
            if (!res.ok) {
                return { ok: false, remote: true, error: 'invalid_credentials' };
            }
            const data = await res.json();
            login(data.username);
            return { ok: true, remote: true };
        } catch (e) {
            login(username);
            return { ok: true, remote: false };
        }
    }

    return { isLoggedIn, login, logout, getSession, loginRemote };
})();
