# Workflows

## Link search

1. User starts search.
2. Course name is normalized and searched.
3. Ambiguous results are presented as buttons.
4. User selects course, instructor, and semester.
5. Only approved `group_links` are returned.

## Link submission

1. User selects course/instructor/semester.
2. URL is syntactically validated as HTTP(S).
3. Canonical URL is checked against approved links and pending submissions.
4. Normal users create `pending` submissions.
5. Coadmins/admins may register a validated link directly.
6. Moderators approve/reject/reply through the configured moderation context.
7. PostgreSQL's unique canonical URL constraint protects against duplicate approvals.

## Course suggestions

1. User proposes a missing course.
2. Suggestion is stored as pending.
3. Coadmin review records the supervisor and forwards it to the admin-only context.
4. Admin final approval creates the course.

## Sessions

Sessions are persisted in PostgreSQL, scoped to one Telegram user, and expire after one hour. `/cancel` ends the active session.

## Authorization

Telegram group membership is not used as the authority for application roles. Roles are read from PostgreSQL. Moderation callbacks additionally verify the configured chat context.
