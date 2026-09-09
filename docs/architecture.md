# Architecture

## Runtime

- Node.js 20+
- Express 5
- grammY 1.46
- PostgreSQL via `pg`
- Telegram Bot API webhooks
- Railway persistent service + Railway PostgreSQL

## Request flow

```text
Telegram
  │ POST Update
  ▼
Express /telegram/webhook
  │
grammY webhookCallback
  ├── message → handlers/message.js
  └── callback_query → handlers/callback_query.js
       │
       ├── auth.js
       ├── sessions.js
       ├── validation.js
       ├── matching.js
       ├── keyboards.js / messages.js
       └── db.js → PostgreSQL
```

`lib/platform.js` is the Telegram integration boundary. Existing business handlers continue to use a small raw-Bot-API-shaped adapter, while grammY owns webhook parsing and Telegram API transport.

## Persistence

All state required across requests lives in PostgreSQL:

- users
- courses
- semesters
- group_links
- submissions
- course_change_requests
- course_suggestions
- user_sessions
- audit_logs
- bot_settings

No process-local session state is used for the actual bot workflow.

## Webhook security

Telegram supports a webhook secret token. When `WEBHOOK_SECRET` is set, the application configures the same secret with `setWebhook` and grammY verifies the incoming `X-Telegram-Bot-Api-Secret-Token` header.

## Railway health

`/health` returns HTTP 200 while the Node process is serving. Railway uses it as a deployment healthcheck and routes traffic after the new deployment becomes healthy.
