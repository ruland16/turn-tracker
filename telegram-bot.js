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

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || msg.chat.username || '';
  // Log so a parent can grab the chat_id from the server logs to link this kid.
  console.log(`[Telegram] /start from ${name} (@${msg.chat.username || '-'}) chat_id=${chatId}`);
  try {
    await bot.sendMessage(chatId,
      `Hi ${name}! I'll send you chore reminders.\n\n` +
      `Your Telegram ID is: ${chatId}\n\n` +
      `Send this ID to your parent so they can link this chat to your name.`);
  } catch (err) {
    console.error('Failed to send /start reply:', err.message);
  }
});

// Acknowledge a callback without letting a failure bubble up as an
// unhandled rejection (which crashes Node 22). If the callback query has
// already expired (e.g. update delivered late after a polling backoff),
// answerCallbackQuery throws "query is too old" — we just log and move on.
async function ack(query, text) {
  try {
    await bot.answerCallbackQuery(query.id, text ? { text } : undefined);
  } catch (err) {
    console.warn('answerCallbackQuery failed:', err.message);
  }
}

bot.on('callback_query', async (query) => {
  try {
    const data = query.data || '';
    if (!data.startsWith('done:')) {
      await ack(query);
      return;
    }

    const assignmentId = parseInt(data.split(':')[1], 10);
    const assignment = getAssignmentById(assignmentId);

    if (!assignment) {
      await ack(query, 'Assignment not found.');
      return;
    }

    if (assignment.status === 'done') {
      await ack(query, 'Already marked done!');
    } else {
      markDone(assignmentId);
      await ack(query, 'Great job! Marked as done.');
    }

    // Update the original message so the kid sees confirmation even if the
    // popup/spinner already timed out on their device. Skip if the message is
    // too old to be included in the callback (>48h) or can't be edited.
    if (query.message) {
      try {
        await bot.editMessageText(
          query.message.text + '\n\n✅ Done',
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        );
      } catch (err) {
        if (!/message is not modified/i.test(err.message)) {
          console.warn('editMessageText failed:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('callback_query handler error:', err.message);
    await ack(query, 'Something went wrong — please try again.');
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

async function sendReminder(kid, assignment) {
  if (!kid.chat_id) return;

  const text = `⏰ *Reminder*, ${kid.name}! You haven't confirmed *${assignment.display_name}* yet. Tap the button once it's done!`;
  const keyboard = {
    inline_keyboard: [[
      { text: `✅ Done with ${assignment.display_name}`, callback_data: `done:${assignment.id}` }
    ]]
  };

  try {
    await bot.sendMessage(kid.chat_id, text, {
      parse_mode: 'Markdown',
      reply_markup: JSON.stringify(keyboard)
    });
    console.log(`Telegram reminder sent to ${kid.name}`);
  } catch (err) {
    console.error(`Failed to send Telegram reminder to ${kid.name}:`, err.message);
  }
}

module.exports = { bot, sendNotification, sendReminder };
