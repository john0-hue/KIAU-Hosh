# KIAU Hoosh Telegram Bot

Persian Telegram bot for discovering KIAU course group links, submitting new links for moderation, suggesting courses, and administering courses/semesters/users.

This repository is a **Railway-ready Node.js application**. It is not a Telegram Serverless project and does not depend on `tgcloud`, `sdk`, or Telegram Serverless's SQLite runtime.

## Architecture

```text
Telegram Bot API
       │ HTTPS webhook
       ▼
Railway Node.js service
  ├── Express /health
  ├── grammY webhook adapter
  ├── handlers/message.js
  └── handlers/callback_query.js
       │
       ▼
Railway PostgreSQL
```

Railway supplies `PORT` and `RAILWAY_PUBLIC_DOMAIN`. The service can automatically call Telegram `setWebhook` at startup when a public Railway domain is available. PostgreSQL schema creation runs through Railway's pre-deploy command.

## Requirements

- Node.js 20+
- A Telegram bot token from BotFather
- A Railway project
- A Railway PostgreSQL service

## Local setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm start
```

For local webhook testing, expose the local HTTP server through an HTTPS tunnel and set `WEBHOOK_URL` accordingly. Long polling is intentionally not used by the production entrypoint because Railway is configured around Telegram webhooks.

## Environment variables

Required:

- `BOT_TOKEN` — Telegram Bot API token.
- `DATABASE_URL` — Railway PostgreSQL connection string. In Railway, reference the Postgres service with `${{Postgres.DATABASE_URL}}`.

Recommended:

- `WEBHOOK_SECRET` — random Telegram webhook secret.
- `INITIAL_ADMIN_IDS` — comma-separated numeric Telegram user IDs. These accounts cannot be demoted.

Optional:

- `WEBHOOK_URL` — explicit public base URL. If omitted, the application uses `https://${RAILWAY_PUBLIC_DOMAIN}`.
- `WEBHOOK_PATH` — defaults to `/telegram/webhook`.
- `SUPERVISORS_GROUP_ID` — initial moderation-group chat ID.
- `ADMIN_ONLY_GROUP_ID` — initial admin-only group chat ID.
- `PGSSL=true` — enable relaxed PostgreSQL TLS verification when required by an external database.

Never commit `.env` or real bot tokens.

## Railway deployment

1. Push this repository to GitHub.
2. In Railway, create a project and deploy the repository as a service.
3. Add a PostgreSQL service to the same Railway project.
4. Add `DATABASE_URL=${{Postgres.DATABASE_URL}}` to the bot service.
5. Add `BOT_TOKEN` and the other required variables.
6. Generate a Railway public domain for the bot service.
7. Deploy. `railway.toml` runs `npm run db:migrate` before the service starts and configures `/health` as the healthcheck.
8. On startup, the bot sets its Telegram webhook to the Railway domain plus `WEBHOOK_PATH`.

See `docs/deployment.md` for the detailed checklist.

## Database

`db-schema.sql` defines the PostgreSQL schema. `scripts/migrate.js` applies it idempotently. There are no application-level foreign keys because moderation history and semester deletion are deliberately governed by the bot's business rules.

## Testing

```bash
npm test
npm run test:contract
find . -name '*.js' -print0 | xargs -0 -n1 node --check
```

The test suite does not require a Telegram token or live database.

## Security notes

- Authorization is based on the role stored in PostgreSQL, never on Telegram group membership alone.
- The webhook can be protected by Telegram's `X-Telegram-Bot-Api-Secret-Token` through `WEBHOOK_SECRET`.
- Bootstrap admins are protected from demotion.
- Approved group-link URLs are globally unique by canonical URL in PostgreSQL.
- Only approved links are intended to be searchable.
- Moderation actions verify both role and allowed chat context.
