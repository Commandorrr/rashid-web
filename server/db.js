// Rashid backend - SQLite database setup using Node's built-in node:sqlite
// (no native compilation required, unlike better-sqlite3).
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'rashid.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    income REAL NOT NULL,
    expenses REAL NOT NULL,
    obligations REAL NOT NULL,
    amount REAL NOT NULL,
    tenure INTEGER NOT NULL,
    salary_date TEXT,
    installment_date TEXT,
    has_upcoming_obligation INTEGER DEFAULT 0,
    upcoming_obligation_date TEXT,
    upcoming_obligation_amount REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS selected_offers (

    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    offer_key TEXT NOT NULL,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    tenure INTEGER NOT NULL,
    installment REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
// exists (real data was already seeded during earlier testing), so new
// columns are migrated in with ALTER TABLE - ignore the error if a column
// was already added by a previous server start.
const migrations = [
    "ALTER TABLE applications ADD COLUMN customer_id TEXT",
    "ALTER TABLE applications ADD COLUMN employment_status TEXT DEFAULT 'موظف'",
    "ALTER TABLE applications ADD COLUMN contact_channel TEXT",
    "ALTER TABLE applications ADD COLUMN upcoming_obligation_type TEXT",
    "ALTER TABLE applications ADD COLUMN upcoming_obligation_recurring INTEGER DEFAULT 0",
    "ALTER TABLE applications ADD COLUMN profit_rate_annual REAL"
];
for (const sql of migrations) {
    try {
        db.exec(sql);
    } catch (e) {
        if (!/duplicate column/i.test(e.message)) throw e;
    }
}

module.exports = db;
