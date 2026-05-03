require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./database');
const { scheduleDailyNotifications, runNow } = require('./scheduler');
const { getAssignmentsForDate, markDone, createAssignmentsForDate } = require('./rotations');
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
  const today = new Date().toISOString().slice(0, 10);
  const assignments = getAssignmentsForDate(today);
  res.json({ date: today, assignments });
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

app.post('/api/seed-test', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  createAssignmentsForDate(today);
  const assignments = getAssignmentsForDate(today);
  res.json({ date: today, assignments });
});

app.post('/api/send-now', authMiddleware, async (req, res) => {
  const { sendNotification: sendTelegram } = require('./telegram-bot');
  const { sendNotification: sendGoogleChat } = require('./google-chat-bot');
  const { sendNotification: sendEmail } = require('./email-notifier');
  const today = new Date().toISOString().slice(0, 10);
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Turn Tracker listening on port ${PORT}`);
  scheduleDailyNotifications();
});
