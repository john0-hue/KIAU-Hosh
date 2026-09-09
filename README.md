# KIAU Hoosh Telegram Bot

Persian Telegram bot for discovering KIAU course group links, submitting new links for moderation, suggesting courses, and administering courses, semesters, and users.

This repository is a **Railway-ready Node.js application**. It is not a Telegram Serverless project and does not depend on `tgcloud`, `sdk`, or Telegram Serverless's SQLite runtime.

## 🚀 Deploy on Railway

<!--
After creating/publishing the Railway Template for this repository, replace
YOUR_RAILWAY_TEMPLATE_CODE below with the real Railway template code.
Railway's official Deploy on Railway button requires a template URL.
-->

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/YOUR_RAILWAY_TEMPLATE_CODE?utm_medium=integration&utm_source=button&utm_campaign=kiau-hoosh)

> **Template setup:** Railway's Deploy on Railway button points to a Railway Template. The repository must first be converted into a Railway Template and, if desired, published. Once Railway gives the template its real code, replace `YOUR_RAILWAY_TEMPLATE_CODE` in this README. See the official Railway template documentation for the exact workflow.

### Manual GitHub deployment

If the Railway Template has not been created yet, deploy directly from GitHub:

1. Push this repository to GitHub.
2. Open Railway and create a new project.
3. Choose **Deploy from GitHub repo**.
4. Select this repository.
5. Add a PostgreSQL service to the same Railway project.
6. Configure the environment variables below.
7. Generate a public domain for the bot service.
8. Deploy.

Railway supports GitHub-based deployments and automatically deploys new commits from the connected branch when GitHub autodeploy is enabled.

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

The application uses Telegram's HTTPS webhook mechanism. Railway supplies the service `PORT` and can provide a public domain through `RAILWAY_PUBLIC_DOMAIN`.

## Requirements

- Node.js 20+
- A Telegram bot created with BotFather
- A Telegram Bot API token
- A Railway account
- A Railway PostgreSQL service

## Railway environment variables

Set these variables on the **bot service**.

### Required

```env
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=${{Postgres.DATABASE_URL}}
INITIAL_ADMIN_IDS=123456789
```

### Recommended

```env
WEBHOOK_SECRET=replace_with_a_long_random_secret
```

### Optional

```env
WEBHOOK_URL=https://your-public-domain.example
WEBHOOK_PATH=/telegram/webhook
SUPERVISORS_GROUP_ID=-1001234567890
ADMIN_ONLY_GROUP_ID=-1001234567890
PGSSL=true
```

If `WEBHOOK_URL` is omitted, the application uses:

```text
https://${RAILWAY_PUBLIC_DOMAIN}
```

and appends `WEBHOOK_PATH` (default: `/telegram/webhook`).

### Security

Never commit `.env`, `BOT_TOKEN`, `WEBHOOK_SECRET`, database credentials, or other secrets to GitHub.

`WEBHOOK_SECRET` is used with Telegram's webhook secret-token mechanism. Telegram sends the configured secret in the `X-Telegram-Bot-Api-Secret-Token` header, which the application verifies.

## Database

The project uses PostgreSQL.

The database schema is in:

```text
db-schema.sql
```

The migration script is:

```text
scripts/migrate.js
```

Run it manually with:

```bash
npm run db:migrate
```

Railway is configured to run this migration before starting the service.

The application uses these main tables:

```text
users
courses
semesters
group_links
submissions
course_change_requests
course_suggestions
user_sessions
audit_logs
bot_settings
```

Important uniqueness constraints include:

- normalized course name
- semester code
- canonical group-link URL
- one active session per user

## Railway configuration

`railway.toml` configures:

- PostgreSQL migration before deployment
- `npm start` as the start command
- `/health` as the healthcheck
- automatic restart on failure

The production start command is:

```bash
npm start
```

The migration command is:

```bash
npm run db:migrate
```

## Local development

Install dependencies:

```bash
npm install
```

Copy the environment template.

### macOS / Linux

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

Fill in the values in `.env`, then run:

```bash
npm run db:migrate
npm start
```

For local Telegram webhook testing, expose the local HTTP server through an HTTPS tunnel and set `WEBHOOK_URL` to the tunnel's public URL.

## Health check

The application exposes:

```text
GET /health
```

A healthy service returns HTTP `200`.

## Telegram webhook

The production webhook endpoint is:

```text
POST /telegram/webhook
```

The application configures Telegram's webhook at startup when a public URL is available.

Long polling is intentionally not used by the production entrypoint; Railway runs the bot as an HTTPS webhook service.

## Project structure

```text
.
├── handlers/
│   ├── message.js
│   └── callback_query.js
├── lib/
├── scripts/
│   └── migrate.js
├── tests/
├── docs/
├── .github/
│   └── workflows/
├── db-schema.sql
├── server.js
├── railway.toml
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Testing

Run the application tests:

```bash
npm test
```

Run the platform/contract tests:

```bash
npm run test:contract
```

Check JavaScript syntax:

```bash
find . -name '*.js' -print0 | xargs -0 -n1 node --check
```

On Windows PowerShell, you can check the main entrypoint with:

```powershell
node --check server.js
```

## Roles

The application supports:

```text
user
coadmin
admin
```

Bootstrap administrators are configured through `INITIAL_ADMIN_IDS` and are protected from demotion.

## Production checklist

Before making the bot public, verify:

- [ ] GitHub repository is connected to Railway.
- [ ] PostgreSQL service is running.
- [ ] `DATABASE_URL` is connected to PostgreSQL.
- [ ] `BOT_TOKEN` is configured.
- [ ] `INITIAL_ADMIN_IDS` contains the intended administrator IDs.
- [ ] `WEBHOOK_SECRET` is configured.
- [ ] Railway public domain is generated.
- [ ] `/health` returns HTTP 200.
- [ ] Telegram webhook is configured successfully.
- [ ] `/start` works.
- [ ] Course search works.
- [ ] Instructor and semester selection works.
- [ ] Group-link submission works.
- [ ] Supervisor moderation works.
- [ ] Approval/rejection/reply works.
- [ ] Course suggestions work.
- [ ] Admin/coadmin controls work.
- [ ] `/cancel` works.
- [ ] Session expiration works.

## Railway Template notes

Railway's official documentation says the **Deploy on Railway** button is generated from a Railway Template URL. A template can be created from an existing Railway project and then published to the Railway marketplace.

The final button URL has this form:

```text
https://railway.com/new/template/<TEMPLATE_CODE>?utm_medium=integration&utm_source=button&utm_campaign=kiau-hoosh
```

Once the template has been created, replace `YOUR_RAILWAY_TEMPLATE_CODE` near the top of this README with the actual template code. Do not invent a template code: Railway assigns the real code when the template is created.

## License

MIT
