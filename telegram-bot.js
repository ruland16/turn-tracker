const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const { getAssignmentsForDate, getAssignmentByKidAndTask, markDone, createAssignmentsForDate } = require('./rotations');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN not set. Telegram bot will not start.');
  module.exports = { sendNotification: () => Promise.resolve(), bot: null };
  return;
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || msg.chat.username || '';
  bot.sendMessage(chatId, `Hi ${name}! I'll send you chore reminders. Make sure your parent links this chat to your name in the dashboard.`);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('done:')) {
    const assignmentId = parseInt(data.split(':')[1], 10);
    const assignment = getAssignmentById(assignmentId);

    if (!assignment) {
      bot.answerCallbackQuery(query.id, { text: 'Assignment not found.' });
      return;
    }

    if (assignment.status === 'done') {
      bot.answerCallbackQuery(query.id, { text: 'Already marked done!' });
      return;
    }

    markDone(assignmentId);
    bot.answerCallbackQuery(query.id, { text: 'Great job! Marked as done.' });
    bot.editMessageText(
      query.message.text + '\n\n✅ Done',
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }
});

function getAssignmentById(id) {
  return db.prepare(`
    SELECT a.*, k.name as kid_name, k.platform, k.chat_id, t.name as task_name, t.display_name
    FROM assignments a
    JOIN kids k ON a.kid_id = k.id
    JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ?
  `).get(id);
}

async function sendNotification(kid, assignment) {
  if (!kid.chat_id) {
    console.warn(`No chat_id for kid ${kid.name}`);
    return;
  }

  const text = `Hi ${kid.name}! Today it's your turn to *${assignment.display_name}*. Tap the button when you're done!`;
  const keyboard = {
    inline_keyboard: [[
      { text: `Done with ${assignment.display_name}`, callback_data: `done:${assignment.id}` }
    ]]
  };

  try {
    await bot.sendMessage(kid.chat_id, text, {
      parse_mode: 'Markdown',
      reply_markup: JSON.stringify(keyboard)
    });
    console.log(`Telegram notification sent to ${kid.name}`);
  } catch (err) {
    console.error(`Failed to send Telegram message to ${kid.name}:`, err.message);
  }
}

module.exports = { bot, sendNotification };
