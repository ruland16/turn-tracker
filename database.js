const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'turn-tracker.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS kids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK(platform IN ('telegram','google_chat')),
    chat_id TEXT UNIQUE,
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

function seedIfEmpty() {
  const kidCount = db.prepare('SELECT COUNT(*) as c FROM kids').get().c;
  if (kidCount > 0) return;

  const insertKid = db.prepare('INSERT INTO kids (name, platform, chat_id) VALUES (?, ?, ?)');
  insertKid.run('Matt', 'telegram', null);
  insertKid.run('Rinata', 'telegram', null);
  insertKid.run('Olivia', 'google_chat', null);
  insertKid.run('Akim', 'google_chat', null);

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
