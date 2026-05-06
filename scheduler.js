const cron = require('node-cron');
const { createAssignmentsForDate, getAssignmentsForDate, getKidForTurn } = require('./rotations');
const { sendNotification: sendTelegram, sendReminder: sendTelegramReminder } = require('./telegram-bot');
const { sendNotification: sendGoogleChat } = require('./google-chat-bot');
const { sendNotification: sendEmail, sendReminder: sendEmailReminder } = require('./email-notifier');
const { localDate } = require('./utils');

function scheduleDailyNotifications() {
  cron.schedule('0 8 * * *', async () => {
    const today = localDate();
    console.log(`[${new Date().toISOString()}] Running daily assignments for ${today}`);

    createAssignmentsForDate(today);
    const assignments = getAssignmentsForDate(today);

    for (const assignment of assignments) {
      if (assignment.status !== 'pending') continue;

      const kid = { id: assignment.kid_id, name: assignment.kid_name, platform: assignment.platform, chat_id: assignment.chat_id, email: assignment.email };

      if (assignment.platform === 'telegram') {
        await sendTelegram(kid, assignment);
      } else if (assignment.platform === 'google_chat') {
        await sendGoogleChat(kid, assignment);
      } else if (assignment.platform === 'email') {
        await sendEmail(kid, assignment);
      }
    }

    console.log(`[${new Date().toISOString()}] Daily notifications sent.`);
  }, {
    timezone: process.env.TIMEZONE || 'UTC',
  });

  // 10pm reminder: re-notify anyone who hasn't confirmed yet
  cron.schedule('0 22 * * *', async () => {
    const today = localDate();
    console.log(`[${new Date().toISOString()}] Running 10pm reminders for ${today}`);

    const assignments = getAssignmentsForDate(today);
    const pending = assignments.filter(a => a.status === 'pending');

    for (const assignment of pending) {
      const kid = { id: assignment.kid_id, name: assignment.kid_name, platform: assignment.platform, chat_id: assignment.chat_id, email: assignment.email };

      if (assignment.platform === 'telegram') {
        await sendTelegramReminder(kid, assignment);
      } else if (assignment.platform === 'email') {
        await sendEmailReminder(kid, { ...assignment, confirm_token: assignment.confirm_token });
      }
    }

    console.log(`[${new Date().toISOString()}] 10pm reminders done. Sent ${pending.length} reminder(s).`);
  }, {
    timezone: process.env.TIMEZONE || 'UTC',
  });

  const tz = process.env.TIMEZONE || 'UTC';
  console.log(`Daily scheduler started: notifications at 08:00 and reminders at 22:00 ${tz}`);
}

function runNow() {
  const today = localDate();
  createAssignmentsForDate(today);
  const assignments = getAssignmentsForDate(today);
  return assignments;
}

module.exports = { scheduleDailyNotifications, runNow };
