# Railway migration audit

## Removed Telegram Serverless assumptions

- Removed `sdk` imports.
- Removed `tgcloud` CLI dependency.
- Removed Serverless `schema.js`.
- Removed Serverless handler deployment model.
- Removed global/fake bot runtime assumptions.
- Removed SQLite-specific SQL from the runtime data layer.

## Added Railway runtime

- `server.js` Express entrypoint.
- grammY webhook integration.
- PostgreSQL `pg` data layer.
- `db-schema.sql`.
- idempotent `scripts/migrate.js`.
- `railway.toml` with pre-deploy migration and `/health` healthcheck.
- environment-based secrets/configuration.

## Business-layer repairs included in this migration

- Fixed Node ESM relative imports.
- Fixed callback handler variable/reference errors.
- Aligned callback-driven session states with the message handler.
- Persisted both snake_case and legacy camelCase selection fields where compatibility is useful.
- Added semester fallback to active semesters when a course/instructor has no approved historical semester links.
- Fixed approved-link creation to preserve instructor display name and submitted URL.
- Fixed user-role UI to use `coadmin` rather than the obsolete `supervisor` role.
- Fixed admin/private moderation actions so the private admin panel can actually invoke moderation actions while still enforcing role checks.
- Fixed suggestion final-approval logic so only an exact `coadmin` performs the supervisor-review branch; an admin performs final approval.
- Added database joins needed by moderation/admin displays.

## Verification

The following were run locally without requiring live Railway credentials:

- `node --check` for every JavaScript file.
- Railway contract tests.
- Existing matching/message tests: 12/12 passed.

A live `npm install`, Railway PostgreSQL migration, Telegram webhook registration, and real Telegram update were **not** performed in this environment because they require external credentials/network access. Those are the final deployment-stage checks.
