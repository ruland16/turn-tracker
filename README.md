# Turn Tracker

A family chore rotation tracker that sends daily notifications via Telegram and Email, with a web dashboard for parents.

## Features

- **Daily automatic assignments**: Rotates kids through chores based on a start date.
- **Telegram bot**: Sends messages with inline "Done" buttons to Matt and Rinata.
- **Email notifications**: Sends daily turn reminders to Olivia and Akim via email.
- **Web dashboard**: View today's assignments, history, manually mark done, and trigger notifications on demand.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Port for the web server (default 3000) |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `SMTP_HOST` | SMTP server host (e.g. smtp.gmail.com) |
| `SMTP_PORT` | SMTP server port (usually 587) |
| `SMTP_SECURE` | Use TLS? (usually false for port 587) |
| `SMTP_USER` | SMTP login email |
| `SMTP_PASS` | SMTP password or app password |
| `DASHBOARD_AUTH_TOKEN` | Secret password for the dashboard |
| `START_DATE` | Date to begin rotation counting (YYYY-MM-DD) |

### 3. Set up Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram, create a bot, and get a token.
2. Paste the token into `.env` as `TELEGRAM_BOT_TOKEN`.
3. Have Matt and Rinata start a chat with your bot and send `/start`.
4. Open `turn-tracker.db` with any SQLite viewer or use the DB API to set their `chat_id`:
   ```sql
   UPDATE kids SET chat_id = '123456789' WHERE name = 'Matt';
   ```
   (The bot prints incoming chat IDs to the console when someone messages it.)

### 4. Set up Email notifications

1. In `.env`, set your SMTP credentials. For Gmail:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```
   (Generate an app password at https://myaccount.google.com/apppasswords)
2. Update the kids table with email addresses:
   ```sql
   UPDATE kids SET platform = 'email', email = 'akus.shaikh@gmail.com' WHERE name = 'Akim';
   UPDATE kids SET platform = 'email', email = 'oliviiashaikh@gmail.com' WHERE name = 'Olivia';
   ```

### 5. Run locally

```bash
npm start
```

Open `http://localhost:3000` and enter your `DASHBOARD_AUTH_TOKEN` to view the dashboard.

## Deployment

### Option A: Render (easiest, free tier available)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com), create a **Web Service**, connect your GitHub repo.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Add environment variables in the Render dashboard.
5. **Important**: Render's free tier spins down. For a daily cron job to fire reliably, you may want a paid plan or a cron-job ping service to keep it awake, or use a VPS.

### Option B: Railway / Fly.io

Both support Node.js apps with persistent disks. Set up similarly to Render.

### Option C: VPS (DigitalOcean, Hetzner, Linode)

1. Rent a small Linux VPS.
2. Install Node.js and git.
3. Clone the repo, run `npm install`, create `.env`.
4. Use `pm2` to keep the app running:
   ```bash
   npm install -g pm2
   pm2 start app.js --name turn-tracker
   pm2 save
   pm2 startup
   ```
5. Put Nginx or Caddy in front for HTTPS (required for Google Chat webhooks).
6. Use `certbot` for a free SSL certificate.

## Data model

- **kids**: Matt, Rinata (telegram); Olivia, Akim (google_chat)
- **tasks**: unload_dishes (4 kids rotating), walk_dog (2 kids rotating)
- **assignments**: one row per task per day, tracks who is assigned and whether they clicked Done.

## Rotation logic

The turn is calculated deterministically from the start date:

```
index = daysSince(START_DATE, today) % numberOfKidsForTask
```

This means you can change the `START_DATE` in `.env` to shift the rotation without losing history.

## Extending

- Add more tasks in `database.js` (`seedIfEmpty`) or via SQL.
- Add more kids with their platform and chat_id.
- Build a React Native or PWA app later using the same REST API (`/api/today`, `/api/history`, etc.).
