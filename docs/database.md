# Database

Railway PostgreSQL is the source of truth.

## Tables

### users
Telegram users and application roles (`user`, `coadmin`, `admin`).

### courses
Normalized course names are globally unique.

### semesters
Unique semester codes and an active flag.

### group_links
Approved course/instructor/semester group links. `canonical_url` is globally unique.

### submissions
Moderation records for submitted links. They remain as history after approval/rejection.

### course_change_requests
Coadmin/user requests for course changes. Admin approval is the final privileged step.

### course_suggestions
New-course suggestions. A coadmin review can record `supervisor_id`; only the admin final-approval path creates the course.

### user_sessions
One persisted session per user with an expiry timestamp. Sessions expire after one hour.

### audit_logs
Privileged actions and moderation events.

### bot_settings
Configurable moderation/admin group IDs and other runtime settings.

## Constraints

- `users.telegram_id` is the primary key.
- `courses.normalized_name` is unique.
- `semesters.code` is unique.
- `group_links.canonical_url` is unique.
- `user_sessions.user_id` is unique.

There are intentionally no foreign keys. The application must protect moderation history and must not use cascading deletes that silently remove historical submissions.
