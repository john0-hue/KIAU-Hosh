import express from 'express';
import { webhookCallback } from 'grammy';
import messageHandler from './handlers/message.js';
import callbackQueryHandler from './handlers/callback_query.js';
import { telegramBot } from './lib/platform.js';
import { cleanupExpiredSessions } from './lib/db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const webhookPath = process.env.WEBHOOK_PATH || '/telegram/webhook';
const webhookSecret = process.env.WEBHOOK_SECRET || '';

console.log('[server] BUILD: webhook-json-fix-v1');

app.disable('x-powered-by');

app.get('/', (_req, res) =>
  res.status(200).json({ ok: true, service: 'kiau-hoosh' }),
);

app.get('/health', (_req, res) =>
  res.status(200).json({ ok: true, uptime: process.uptime() }),
);

// Telegram sends the Update as a JSON request body.
// Parse it before grammY's Express webhook middleware receives the request.
app.use(express.json());

app.use(
  webhookPath,
  webhookCallback(telegramBot, 'express', {
    secretToken: webhookSecret || undefined,
  }),
);

telegramBot.on('message', async (ctx) => {
  await messageHandler(ctx.update.message);
});

telegramBot.on('callback_query', async (ctx) => {
  await callbackQueryHandler(ctx.update.callback_query);
});

telegramBot.catch((error) => {
  console.error('[telegram] update error:', error.error);
});

async function configureWebhook() {
  const domain =
    process.env.WEBHOOK_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : '');

  if (!domain) {
    console.warn(
      '[telegram] WEBHOOK_URL/RAILWAY_PUBLIC_DOMAIN is not set; webhook was not configured.',
    );
    return;
  }

  const base = domain.replace(/\/$/, '');
  const url = `${base}${webhookPath}`;

  const options = {
    allowed_updates: ['message', 'callback_query'],
    max_connections: Number(
      process.env.TELEGRAM_MAX_CONNECTIONS || 40,
    ),
  };

  if (webhookSecret) {
    options.secret_token = webhookSecret;
  }

  await telegramBot.api.setWebhook(url, options);

  console.log(`[telegram] webhook configured: ${url}`);
}

const server = app.listen(port, '0.0.0.0', async () => {
  console.log(`[server] listening on ${port}`);

  try {
    await configureWebhook();
  } catch (error) {
    console.error(
      '[telegram] webhook configuration failed:',
      error,
    );
  }
});

const cleanupTimer = setInterval(() => {
  cleanupExpiredSessions().catch((error) =>
    console.error('[db] session cleanup failed:', error),
  );
}, 15 * 60 * 1000);

cleanupTimer.unref();

async function shutdown(signal) {
  console.log(`[server] ${signal}; shutting down`);
  clearInterval(cleanupTimer);

  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));