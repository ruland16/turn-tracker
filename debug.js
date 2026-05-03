const Database = require('better-sqlite3');
const db = new Database('/var/www/turn-tracker/turn-tracker.db');

console.log('=== Tables ===');
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).join(', '));

console.log('\n=== Tasks columns ===');
console.table(db.prepare('PRAGMA table_info(tasks)').all());

console.log('\n=== Tasks data ===');
console.table(db.prepare('SELECT * FROM tasks').all());

console.log('\n=== Kids data ===');
console.table(db.prepare('SELECT * FROM kids').all());

console.log('\n=== Makeup assignments ===');
console.table(db.prepare('SELECT * FROM makeup_assignments').all());

console.log('\n=== Todays assignments ===');
const today = new Date().toISOString().slice(0, 10);
console.table(db.prepare('SELECT * FROM assignments WHERE date = ?').all(today));

db.close();
