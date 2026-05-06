require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./database');
const { scheduleDailyNotifications, runNow } = require('./scheduler');
const { getAssignmentsForDate, markDone, getAssignmentByToken, createAssignmentsForDate, toggleTaskEnabled, reassignAssignment, skipAssignment, getTasks, getKidForTurn, getPendingMakeup } = require('./rotations');
const { localDate } = require('./utils');
const { handleWebhook } = require('./google-chat-bot');
require('./telegram-bot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DASHBOARD_TOKEN = process.env.DASHBOARD_AUTH_TOKEN || 'secret';

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token !== DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/today', authMiddleware, (req, res) => {
  const today = localDate();
  createAssignmentsForDate(today);
  const assignments = getAssignmentsForDate(today);
  res.json({ date: today, assignments });
});

app.get('/api/tomorrow', authMiddleware, (req, res) => {
  const tz = process.env.TIMEZONE || 'UTC';
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const d = new Date(todayStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  const tomorrowStr = d.toLocaleDateString('en-CA');
  const tasks = getTasks().filter(t => t.enabled === 1);
  const assignments = tasks.map(task => {
    const kidIds = JSON.parse(task.kid_ids);
    let kid = null;
    if (kidIds.length === 2) {
      const makeup = getPendingMakeup(task.id);
      if (makeup) kid = db.prepare('SELECT * FROM kids WHERE id = ?').get(makeup.kid_id);
    }
    if (!kid) kid = getKidForTurn(task.id, tomorrowStr);
    return { display_name: task.display_name, kid_name: kid ? kid.name : null };
  });
  res.json({ date: tomorrowStr, assignments });
});

app.get('/api/history', authMiddleware, (req, res) => {
  const days = parseInt(req.query.days, 10) || 7;
  const rows = db.prepare(`
    SELECT a.*, k.name as kid_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.date >= date('now', '-${days} days')
    ORDER BY a.date DESC, t.id
  `).all();
  res.json(rows);
});

app.post('/api/assignments/:id/done', authMiddleware, (req, res) => {
  markDone(req.params.id);
  res.json({ success: true });
});

app.get('/api/kids', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id, name FROM kids ORDER BY id').all();
  res.json(rows);
});

app.get('/api/tasks', authMiddleware, (req, res) => {
  const tasks = getTasks();
  res.json(tasks);
});

app.post('/api/tasks/:id/toggle', authMiddleware, (req, res) => {
  const result = toggleTaskEnabled(req.params.id);
  res.json(result);
});

app.post('/api/assignments/:id/reassign', authMiddleware, (req, res) => {
  const { kid_id } = req.body;
  if (!kid_id) return res.status(400).json({ error: 'kid_id required' });
  reassignAssignment(req.params.id, kid_id);
  res.json({ success: true });
});

app.post('/api/assignments/:id/skip', authMiddleware, (req, res) => {
  const result = skipAssignment(req.params.id);
  res.json(result);
});

app.post('/api/seed-test', authMiddleware, (req, res) => {
  const today = localDate();
  createAssignmentsForDate(today);
  const assignments = getAssignmentsForDate(today);
  res.json({ date: today, assignments });
});

app.post('/api/send-now', authMiddleware, async (req, res) => {
  const { sendNotification: sendTelegram } = require('./telegram-bot');
  const { sendNotification: sendGoogleChat } = require('./google-chat-bot');
  const { sendNotification: sendEmail } = require('./email-notifier');
  const today = localDate();
  const assignments = getAssignmentsForDate(today);

  for (const a of assignments) {
    if (a.status === 'pending') {
      const kid = { id: a.kid_id, name: a.kid_name, platform: a.platform, chat_id: a.chat_id, email: a.email };
      if (a.platform === 'telegram') await sendTelegram(kid, a);
      else if (a.platform === 'google_chat') await sendGoogleChat(kid, a);
      else if (a.platform === 'email') await sendEmail(kid, a);
    }
  }

  res.json({ sent: assignments.length });
});

app.post('/google-chat', async (req, res) => {
  try {
    const response = await handleWebhook(req);
    res.json(response);
  } catch (err) {
    console.error('Google Chat webhook error:', err);
    res.status(500).json({ text: 'Something went wrong.' });
  }
});

app.get('/confirm', (req, res) => {
  const { token } = req.query;

  function page(title, message, success) {
    const color = success ? '#16a34a' : '#dc2626';
    const icon = success ? '✅' : '❌';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Turn Tracker</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; text-align: center; }
    .card { background: white; border-radius: 12px; padding: 40px 32px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h2 { margin: 0 0 12px; color: #111; font-size: 22px; }
    p { color: #555; line-height: 1.6; margin: 0; font-size: 16px; }
    .badge { display: inline-block; margin-top: 20px; background: ${color}18; color: ${color}; border-radius: 999px; padding: 6px 16px; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="badge">Turn Tracker</div>
  </div>
</body>
</html>`;
  }

  if (!token) {
    return res.status(400).send(page('Invalid link', 'No confirmation token provided.', false));
  }

  const assignment = getAssignmentByToken(token);
  if (!assignment) {
    return res.status(404).send(page('Invalid link', 'This confirmation link is not valid or has expired.', false));
  }

  if (assignment.status === 'done') {
    return res.send(page(
      'Already confirmed!',
      `${assignment.kid_name}, your turn for <strong>${assignment.display_name}</strong> was already marked as done. Thanks!`,
      true
    ));
  }

  markDone(assignment.id);
  return res.send(page(
    'All done!',
    `Thanks ${assignment.kid_name}! Your turn for <strong>${assignment.display_name}</strong> on ${assignment.date} has been marked as complete. The next turn goes to the next person automatically.`,
    true
  ));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Turn Tracker listening on port ${PORT}`);
  scheduleDailyNotifications();
});
