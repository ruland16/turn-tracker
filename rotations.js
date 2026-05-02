const db = require('./database');

function getStartDate() {
  return new Date(process.env.START_DATE || '2026-01-01');
}

function daysSinceStart(date) {
  const start = getStartDate();
  const d = new Date(date);
  start.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - start) / (1000 * 60 * 60 * 24));
}

function getKidForTurn(taskId, forDate = new Date().toISOString().slice(0, 10)) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const kidIds = JSON.parse(task.kid_ids);
  if (kidIds.length === 0) return null;

  const dayIndex = daysSinceStart(forDate);
  const kidId = kidIds[dayIndex % kidIds.length];

  return db.prepare('SELECT * FROM kids WHERE id = ?').get(kidId);
}

function createAssignmentsForDate(date = new Date().toISOString().slice(0, 10)) {
  const tasks = db.prepare('SELECT * FROM tasks').all();
  const insert = db.prepare('INSERT OR IGNORE INTO assignments (date, task_id, kid_id) VALUES (?, ?, ?)');

  for (const task of tasks) {
    const kid = getKidForTurn(task.id, date);
    if (kid) {
      insert.run(date, task.id, kid.id);
    }
  }
}

function getAssignmentsForDate(date = new Date().toISOString().slice(0, 10)) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, k.platform, k.chat_id, t.name as task_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.date = ?
    ORDER BY t.id
  `).all(date);
}

function markDone(assignmentId) {
  return db.prepare(
    'UPDATE assignments SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run('done', assignmentId);
}

function getAssignmentById(id) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, k.platform, k.chat_id, t.name as task_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ?
  `).get(id);
}

function getAssignmentByKidAndTask(date, kidId, taskId) {
  return db.prepare('SELECT * FROM assignments WHERE date = ? AND kid_id = ? AND task_id = ?').get(date, kidId, taskId);
}

module.exports = {
  getKidForTurn,
  createAssignmentsForDate,
  getAssignmentsForDate,
  markDone,
  getAssignmentById,
  getAssignmentByKidAndTask,
  daysSinceStart
};
