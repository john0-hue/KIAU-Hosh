# Railway deployment

## 1. GitHub

Push the repository root to GitHub. Do not commit `.env`, bot tokens, database passwords, or other secrets.

## 2. Create Railway project

Create a Railway project and connect the GitHub repository as a service. Railway can deploy directly from a connected GitHub repository and automatically redeploy when the linked branch changes.

## 3. Add PostgreSQL

Add **PostgreSQL** to the same Railway project. Railway exposes a `DATABASE_URL` variable from the Postgres service.

Set this variable on the bot service using a Railway reference variable:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Keep the database private; the bot only needs the private service connection.

## 4. Add variables

At minimum:

```text
BOT_TOKEN=<BotFather token>
WEBHOOK_SECRET=<random secret>
INITIAL_ADMIN_IDS=<numeric Telegram user IDs, comma separated>
```

Optional initial settings:

```text
SUPERVISORS_GROUP_ID=-100...
ADMIN_ONLY_GROUP_ID=-100...
```

The application also understands `RAILWAY_PUBLIC_DOMAIN`, which Railway supplies after a public domain is generated.

## 5. Generate a public domain

Railway services are not publicly reachable until a public domain is assigned. In the bot service, use **Settings → Networking → Generate Domain**.

The application then constructs:

```text
https://<RAILWAY_PUBLIC_DOMAIN>/telegram/webhook
```

unless `WEBHOOK_URL` or `WEBHOOK_PATH` overrides it.

## 6. Deploy

`railway.toml` configures:

```toml
[deploy]
preDeployCommand = ["npm run db:migrate"]
startCommand = "npm start"
healthcheckPath = "/health"
```

The pre-deploy command creates/updates the PostgreSQL tables before the application starts.

## 7. Verify

Check:

```text
GET https://<domain>/health
```

Then inspect Railway deployment logs for:

```text
[server] listening on ...
[telegram] webhook configured: https://.../telegram/webhook
```

Finally send `/start` to the bot.

## 8. Telegram webhook verification

Telegram's Bot API provides `getWebhookInfo`. It should report the Railway webhook URL and a low/zero pending-update count during normal operation.

If a previous hosting provider owns the webhook, the application's startup `setWebhook` call replaces it.

## 9. Rollback safety

Database migrations are intentionally additive/idempotent. Before destructive schema changes, make a database backup and create a deliberate migration rather than editing `db-schema.sql` in a destructive way.
