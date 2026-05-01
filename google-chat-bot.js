const { google } = require('googleapis');
const db = require('./database');

let chatClient = null;

function getChatClient() {
  if (chatClient) return chatClient;
  const serviceAccountJson = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    const creds = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/chat.bot']
    });
    chatClient = google.chat({ version: 'v1', auth });
    return chatClient;
  } catch (e) {
    console.warn('Failed to initialize Google Chat client:', e.message);
    return null;
  }
}

async function sendNotification(kid, assignment) {
  if (!kid.chat_id) {
    console.warn(`No chat_id for Google Chat kid ${kid.name}`);
    return;
  }

  const client = getChatClient();
  if (!client) {
    console.warn('Google Chat client not configured');
    return;
  }

  const spaceId = kid.chat_id;
  const text = `Hi ${kid.name}! Today it's your turn to ${assignment.display_name}. Tap "Done" when finished!`;

  const body = {
    text,
    cardsV2: [{
      cardId: `assignment-${assignment.id}`,
      card: {
        sections: [{
          widgets: [{
            buttonList: {
              buttons: [{
                text: `Done with ${assignment.display_name}`,
                onClick: {
                  action: {
                    function: 'markDone',
                    parameters: [{ key: 'assignmentId', value: String(assignment.id) }]
                  }
                }
              }]
            }
          }]
        }]
      }
    }]
  };

  try {
    await client.spaces.messages.create({
      parent: spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`,
      requestBody: body
    });
    console.log(`Google Chat notification sent to ${kid.name}`);
  } catch (err) {
    console.error(`Failed to send Google Chat message to ${kid.name}:`, err.message);
  }
}

async function handleWebhook(req) {
  const event = req.body;
  if (!event) return { text: 'No event' };

  if (event.type === 'CARD_CLICKED') {
    const action = event.common?.invokedFunction;
    const params = event.common?.parameters || {};

    if (action === 'markDone') {
      const assignmentId = parseInt(params.assignmentId, 10);
      const { markDone, getAssignmentById } = require('./rotations');
      const assignment = getAssignmentById(assignmentId);

      if (!assignment) {
        return { text: 'Assignment not found.' };
      }
      if (assignment.status === 'done') {
        return { text: 'Already done!' };
      }

      markDone(assignmentId);
      return { text: 'Great job! Marked as done.' };
    }
  }

  if (event.type === 'MESSAGE' && event.message?.text?.toLowerCase().includes('done')) {
    return { text: 'Please use the Done button on the card I sent you!' };
  }

  return { text: 'Hello! I will send you daily chore reminders. Use the buttons on the cards to confirm completion.' };
}

module.exports = { sendNotification, handleWebhook };
