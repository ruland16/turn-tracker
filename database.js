const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'turn-tracker.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS kids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK(platform IN ('telegram','google_chat','email')),
    chat_id TEXT UNIQUE,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    kid_ids TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    task_id INTEGER NOT NULL,
    kid_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
    completed_at DATETIME,
    UNIQUE(date, task_id),
    FOREIGN KEY(task_id) REFERENCES tasks(id),
    FOREIGN KEY(kid_id) REFERENCES kids(id)
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments(date);
  CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
`);

function migrateSchema() {
  const columns = db.prepare("PRAGMA table_info(kids)").all();
  const hasEmail = columns.some(c => c.name === 'email');

  if (!hasEmail) {
    db.exec(`ALTER TABLE kids ADD COLUMN email TEXT`);
  }

  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kids'").get();
  const tableSql = tableInfo?.sql || '';

  const hasOldConstraint = tableSql.includes("('telegram','google_chat')") && !tableSql.includes("'email'");
  if (hasOldConstraint) {
    console.log('[DB] Recreating kids table to support email platform...');
    db.exec(`PRAGMA foreign_keys = OFF;`);
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE kids_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL CHECK(platform IN ('telegram','google_chat','email')),
        chat_id TEXT UNIQUE,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO kids_new (id, name, platform, chat_id, email, created_at)
        SELECT id, name, platform, chat_id, NULL, created_at FROM kids;
      DROP TABLE kids;
      ALTER TABLE kids_new RENAME TO kids;
      COMMIT;
    `);
    db.exec(`PRAGMA foreign_keys = ON;`);
  }
}

migrateSchema();

function seedIfEmpty() {
  const kidCount = db.prepare('SELECT COUNT(*) as c FROM kids').get().c;
  if (kidCount > 0) return;

  const insertKid = db.prepare('INSERT INTO kids (name, platform, chat_id) VALUES (?, ?, ?)');
  insertKid.run('Matt', 'telegram', null);
  insertKid.run('Rinata', 'telegram', null);
  insertKid.run('Olivia', 'email', null);
  insertKid.run('Akim', 'email', null);

  const kids = db.prepare('SELECT id, name FROM kids').all();
  const kidMap = Object.fromEntries(kids.map(k => [k.name, k.id]));

  const insertTask = db.prepare('INSERT INTO tasks (name, display_name, kid_ids) VALUES (?, ?, ?)');
  const dishIds = JSON.stringify([kidMap['Matt'], kidMap['Rinata'], kidMap['Olivia'], kidMap['Akim']]);
  const dogIds = JSON.stringify([kidMap['Matt'], kidMap['Rinata']]);

  insertTask.run('unload_dishes', 'Unload Dishes', dishIds);
  insertTask.run('walk_dog', 'Walk the Dog', dogIds);
}

seedIfEmpty();

module.exports = db;
