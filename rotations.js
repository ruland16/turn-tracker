const db = require('./database');
const { localDate } = require('./utils');

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

function getKidForTurn(taskId, forDate = localDate()) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const kidIds = JSON.parse(task.kid_ids);
  if (kidIds.length === 0) return null;

  const dayIndex = daysSinceStart(forDate);
  const kidId = kidIds[dayIndex % kidIds.length];

  return db.prepare('SELECT * FROM kids WHERE id = ?').get(kidId);
}

function getNextKidForTurn(taskId, forDate = localDate()) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const kidIds = JSON.parse(task.kid_ids);
  if (kidIds.length === 0) return null;

  const dayIndex = daysSinceStart(forDate);
  const nextKidId = kidIds[(dayIndex + 1) % kidIds.length];

  return db.prepare('SELECT * FROM kids WHERE id = ?').get(nextKidId);
}

function getPendingMakeup(taskId) {
  return db.prepare(`
    SELECT m.*, k.name as kid_name
    FROM makeup_assignments m
    JOIN kids k ON m.kid_id = k.id
    WHERE m.task_id = ? AND m.status = 'pending'
    ORDER BY m.created_at ASC
    LIMIT 1
  `).get(taskId);
}

function markMakeupDone(makeupId) {
  db.prepare('UPDATE makeup_assignments SET status = ? WHERE id = ?').run('done', makeupId);
}

function createMakeup(taskId, kidId) {
  db.prepare('INSERT INTO makeup_assignments (task_id, kid_id) VALUES (?, ?)').run(taskId, kidId);
}

function createAssignmentsForDate(date = localDate()) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE enabled = 1').all();
  const insert = db.prepare('INSERT OR IGNORE INTO assignments (date, task_id, kid_id) VALUES (?, ?, ?)');

  for (const task of tasks) {
    const kidIds = JSON.parse(task.kid_ids);

    if (kidIds.length === 2) {
      const makeup = getPendingMakeup(task.id);
      if (makeup) {
        insert.run(date, task.id, makeup.kid_id);
        markMakeupDone(makeup.id);
        continue;
      }
    }

    const kid = getKidForTurn(task.id, date);
    if (kid) {
      insert.run(date, task.id, kid.id);
    }
  }
}

function getAssignmentsForDate(date = localDate()) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, k.platform, k.chat_id, k.email, t.name as task_name, t.display_name
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

function setConfirmToken(assignmentId, token) {
  db.prepare('UPDATE assignments SET confirm_token = ? WHERE id = ?').run(token, assignmentId);
}

function getAssignmentByToken(token) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.confirm_token = ?
  `).get(token);
}

function getAssignmentById(id) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, k.platform, k.chat_id, k.email, t.name as task_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ?
  `).get(id);
}

function getAssignmentByKidAndTask(date, kidId, taskId) {
  return db.prepare('SELECT * FROM assignments WHERE date = ? AND kid_id = ? AND task_id = ?').get(date, kidId, taskId);
}

function reassignAssignment(assignmentId, newKidId) {
  return db.prepare('UPDATE assignments SET kid_id = ? WHERE id = ?').run(newKidId, assignmentId);
}

function skipAssignment(assignmentId) {
  const assignment = getAssignmentById(assignmentId);
  if (!assignment) return { error: 'Assignment not found' };

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(assignment.task_id);
  const kidIds = JSON.parse(task.kid_ids);
  const isTwoKidTask = kidIds.length === 2;

  const nextKid = getNextKidForTurn(assignment.task_id, assignment.date);
  if (!nextKid) return { error: 'No next kid found' };

  reassignAssignment(assignmentId, nextKid.id);

  return { success: true, newKid: nextKid, makeup: false };
}

function toggleTaskEnabled(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return { error: 'Task not found' };

  const newEnabled = task.enabled === 1 ? 0 : 1;
  db.prepare('UPDATE tasks SET enabled = ? WHERE id = ?').run(newEnabled, taskId);
  return { success: true, enabled: newEnabled };
}

function getTasks() {
  return db.prepare('SELECT * FROM tasks ORDER BY id').all();
}

function getMakeupCount(taskId, kidId) {
  return db.prepare('SELECT COUNT(*) as c FROM makeup_assignments WHERE task_id = ? AND kid_id = ? AND status = ?').get(taskId, kidId, 'pending').c;
}

module.exports = {
  getKidForTurn,
  getNextKidForTurn,
  getPendingMakeup,
  createAssignmentsForDate,
  getAssignmentsForDate,
  markDone,
  setConfirmToken,
  getAssignmentByToken,
  getAssignmentById,
  getAssignmentByKidAndTask,
  reassignAssignment,
  skipAssignment,
  toggleTaskEnabled,
  getTasks,
  getMakeupCount,
  daysSinceStart
};
