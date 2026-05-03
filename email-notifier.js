const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendNotification(kid, assignment) {
  if (!kid.email) {
    console.log(`[Email] No email address for ${kid.name}, skipping`);
    return;
  }

  const subject = `Turn Tracker: ${assignment.display_name}`;
  const text = `Hi ${kid.name},\n\nToday it's your turn for: ${assignment.display_name}\n\nDate: ${assignment.date}\n\nPlease mark it as done once completed.`;

  try {
    await transporter.sendMail({
      from: `"Turn Tracker" <${process.env.SMTP_USER}>`,
      to: kid.email,
      subject,
      text,
    });
    console.log(`[Email] Sent to ${kid.name} (${kid.email})`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${kid.name}:`, err.message);
  }
}

module.exports = { sendNotification };
