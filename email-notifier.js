const nodemailer = require('nodemailer');
const crypto = require('crypto');
const db = require('./database');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_URL = process.env.APP_URL || 'https://turn-tracker.duckdns.org';

async function sendNotification(kid, assignment) {
  if (!kid.email) {
    console.log(`[Email] No email address for ${kid.name}, skipping`);
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE assignments SET confirm_token = ? WHERE id = ?').run(token, assignment.id);

  const confirmUrl = `${APP_URL}/confirm?token=${token}`;

  const subject = `Turn Tracker: ${assignment.display_name}`;

  const text = `Hi ${kid.name},\n\nToday it's your turn for: ${assignment.display_name}\n\nDate: ${assignment.date}\n\nOnce you're done, click the link below to confirm:\n${confirmUrl}\n\nThanks!`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 480px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h2 { margin: 0 0 8px; color: #111; font-size: 20px; }
    p { color: #555; line-height: 1.5; margin: 12px 0; }
    .task { font-size: 18px; font-weight: 600; color: #111; background: #f0f0f0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
    .btn { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600; margin-top: 8px; }
    .footer { margin-top: 24px; font-size: 13px; color: #aaa; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Hey ${kid.name}! 👋</h2>
    <p>Today it's your turn for:</p>
    <div class="task">${assignment.display_name}</div>
    <p>Once you're done, tap the button below to let everyone know.</p>
    <a href="${confirmUrl}" class="btn">✅ Mark as Done</a>
    <div class="footer">Date: ${assignment.date} &nbsp;·&nbsp; Turn Tracker</div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Turn Tracker" <${process.env.SMTP_USER}>`,
      to: kid.email,
      subject,
      text,
      html,
    });
    console.log(`[Email] Sent to ${kid.name} (${kid.email})`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${kid.name}:`, err.message);
  }
}

module.exports = { sendNotification };
