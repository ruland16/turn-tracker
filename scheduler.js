const cron = require('node-cron');
const { createAssignmentsForDate, getAssignmentsForDate, getKidForTurn } = require('./rotations');
const { sendNotification: sendTelegram } = require('./telegram-bot');
const { sendNotification: sendGoogleChat } = require('./google-chat-bot');
const { sendNotification: sendEmail } = require('./email-notifier');

function scheduleDailyNotifications() {
  cron.schedule('0 8 * * *', async () => {
    const today = new Date().toISOString().slice(0, 10);
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
    timezone: 'UTC'
  });

  console.log('Daily scheduler started: notifications will send every day at 08:00 UTC');
}

function runNow() {
  const today = new Date().toISOString().slice(0, 10);
  createAssignmentsForDate(today);
  const assignments = getAssignmentsForDate(today);
  return assignments;
}

module.exports = { scheduleDailyNotifications, runNow };
