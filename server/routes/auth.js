const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// Register a new bank-employee account.
router.post('/register', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }

    const existing = db.prepare('SELECT id FROM employees WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'username already exists' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO employees (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);
    res.status(201).json({ id: result.lastInsertRowid, username });
});

// Verify credentials against the employees table (bcrypt-hashed passwords).
router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }

    const row = db.prepare('SELECT * FROM employees WHERE username = ?').get(username);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
        return res.status(401).json({ error: 'invalid username or password' });
    }

    res.json({ username: row.username, loggedInAt: new Date().toISOString() });
});

module.exports = router;
