-- PostgreSQL schema for KIAU Hoosh on Railway.
-- Deliberately no foreign keys: moderation/history records are managed by application rules.

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','coadmin','admin')),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT 'fa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_normalized ON courses(normalized_name);

CREATE TABLE IF NOT EXISTS semesters (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_semesters_code ON semesters(code);

CREATE TABLE IF NOT EXISTS group_links (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  course_id BIGINT NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_name_normalized TEXT NOT NULL,
  semester_id BIGINT NOT NULL,
  submitted_by BIGINT NOT NULL,
  approved_by BIGINT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_links_course ON group_links(course_id);
CREATE INDEX IF NOT EXISTS idx_group_links_instructor ON group_links(instructor_name_normalized);
CREATE INDEX IF NOT EXISTS idx_group_links_semester ON group_links(semester_id);
CREATE INDEX IF NOT EXISTS idx_group_links_course_instructor ON group_links(course_id, instructor_name_normalized);

CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  course_id BIGINT NOT NULL,
  course_name TEXT NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_name_normalized TEXT NOT NULL,
  semester_id BIGINT NOT NULL,
  semester_code TEXT NOT NULL,
  submitted_by BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_feedback TEXT NOT NULL DEFAULT '',
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_submissions_canonical_status ON submissions(canonical_url, status);

CREATE TABLE IF NOT EXISTS course_change_requests (
  id BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL,
  course_id BIGINT,
  course_name TEXT NOT NULL DEFAULT '',
  proposed_name TEXT NOT NULL DEFAULT '',
  proposed_normalized_name TEXT NOT NULL DEFAULT '',
  requested_by BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_feedback TEXT NOT NULL DEFAULT '',
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_course_change_requests_status ON course_change_requests(status);

CREATE TABLE IF NOT EXISTS course_suggestions (
  id BIGSERIAL PRIMARY KEY,
  course_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  suggested_by BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  supervisor_id BIGINT,
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  admin_feedback TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_course_suggestions_status ON course_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_course_suggestions_normalized ON course_suggestions(normalized_name);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id BIGINT,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
