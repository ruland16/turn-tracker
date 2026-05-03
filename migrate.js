const Database = require("better-sqlite3");
const db = new Database("turn-tracker.db");

const cols = db.prepare("PRAGMA table_info(kids)").all();
const hasEmail = cols.some(c => c.name === "email");
if (!hasEmail) {
  db.exec("ALTER TABLE kids ADD COLUMN email TEXT");
  console.log("Added email column");
}

const sqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kids'").get();
const sqlStr = sqlRow ? sqlRow.sql : "";
const hasOldConstraint = sqlStr.includes("('telegram','google_chat')") && !sqlStr.includes("'email'");

if (hasOldConstraint) {
  console.log("Recreating kids table...");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN TRANSACTION");
  db.exec("CREATE TABLE kids_new (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, platform TEXT NOT NULL CHECK(platform IN ('telegram','google_chat','email')), chat_id TEXT UNIQUE, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  db.exec("INSERT INTO kids_new (id, name, platform, chat_id, email, created_at) SELECT id, name, platform, chat_id, NULL, created_at FROM kids");
  db.exec("DROP TABLE kids");
  db.exec("ALTER TABLE kids_new RENAME TO kids");
  db.exec("COMMIT");
  db.exec("PRAGMA foreign_keys = ON");
  console.log("Table recreated");
}

db.close();
console.log("Migration done");
