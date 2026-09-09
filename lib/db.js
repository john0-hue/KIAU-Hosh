// PostgreSQL data access layer for Railway.
// Uses DATABASE_URL provided by Railway Postgres.

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10_000),
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error:', err);
});

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
}

function normalizeValue(value) {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) out[key] = normalizeValue(value);
  return out;
}

async function get(sql, params = []) {
  assertDatabaseConfigured();
  const result = await pool.query(sql, params);
  return normalizeRow(result.rows[0]);
}

async function all(sql, params = []) {
  assertDatabaseConfigured();
  const result = await pool.query(sql, params);
  return result.rows.map(normalizeRow);
}

async function run(sql, params = []) {
  assertDatabaseConfigured();
  return pool.query(sql, params);
}

export async function closeDatabase() {
  await pool.end();
}

// === USERS ===
export function getUser(telegramId) {
  return get('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
}

export async function upsertUser(telegramId, firstName, lastName, username, langCode) {
  await run(
    `INSERT INTO users (telegram_id, first_name, last_name, username, language_code)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (telegram_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       username = EXCLUDED.username,
       language_code = EXCLUDED.language_code,
       updated_at = NOW()`,
    [telegramId, firstName || '', lastName || '', username || '', langCode || 'fa'],
  );
  return getUser(telegramId);
}

export function setRole(telegramId, role) {
  return run('UPDATE users SET role=$1, updated_at=NOW() WHERE telegram_id=$2', [role, telegramId]);
}

export function getAllUsers() {
  return all('SELECT * FROM users ORDER BY telegram_id');
}

export async function getUserCount() {
  const row = await get('SELECT COUNT(*)::int AS c FROM users');
  return row;
}

// === COURSES ===
export function getCourse(id) {
  return get('SELECT * FROM courses WHERE id=$1', [id]);
}

export function getCourseByNormalized(normalized) {
  return get('SELECT * FROM courses WHERE normalized_name=$1', [normalized]);
}

export function findCoursesByNormalized(normalized) {
  return all('SELECT * FROM courses WHERE normalized_name LIKE $1 ORDER BY name LIMIT 20', [`%${normalized}%`]);
}

export function getAllCourses() {
  return all('SELECT * FROM courses ORDER BY name');
}

export async function createCourse(name, normalized) {
  if (name && typeof name === 'object') {
    normalized = name.normalized_name || name.normalized || null;
    name = name.name || name.course_name || '';
  }
  if (!normalized) normalized = String(name || '').trim().toLowerCase();

  const result = await run(
    'INSERT INTO courses (name, normalized_name) VALUES ($1,$2) RETURNING id',
    [name, normalized],
  );
  return getCourse(result.rows[0].id);
}

export function updateCourse(id, name, normalized) {
  return run('UPDATE courses SET name=$1, normalized_name=$2, updated_at=NOW() WHERE id=$3', [name, normalized, id]);
}

export function deleteCourse(id) {
  return run('DELETE FROM courses WHERE id=$1', [id]);
}

export function searchCourses(normalized) {
  return all('SELECT * FROM courses WHERE normalized_name LIKE $1 ORDER BY name LIMIT 20', [`%${normalized}%`]);
}

// === SEMESTERS ===
export function getSemester(id) {
  return get('SELECT * FROM semesters WHERE id=$1', [id]);
}

export function getSemesterByCode(code) {
  return get('SELECT * FROM semesters WHERE code=$1', [code]);
}

export function getAllSemesters() {
  return all('SELECT * FROM semesters ORDER BY code DESC');
}

export function getActiveSemesters() {
  return all('SELECT * FROM semesters WHERE active=true ORDER BY code DESC');
}

export async function createSemester(name, code) {
  const result = await run(
    'INSERT INTO semesters (name, code) VALUES ($1,$2) RETURNING id',
    [name, code],
  );
  return getSemester(result.rows[0].id);
}

export function updateSemester(id, name, code, active) {
  return run('UPDATE semesters SET name=$1, code=$2, active=$3, updated_at=NOW() WHERE id=$4', [name, code, Boolean(active), id]);
}

export async function deleteSemester(id) {
  const history = await get('SELECT COUNT(*)::int AS c FROM submissions WHERE semester_id=$1', [id]);
  if (history && history.c > 0) throw new Error('SEMESTER_HAS_SUBMISSION_HISTORY');
  await run('DELETE FROM group_links WHERE semester_id=$1', [id]);
  return run('DELETE FROM semesters WHERE id=$1', [id]);
}

// === GROUP LINKS ===
export function getGroupLink(id) {
  return get('SELECT * FROM group_links WHERE id=$1', [id]);
}

export function getGroupLinkByCanonicalUrl(canonical) {
  return get('SELECT * FROM group_links WHERE canonical_url=$1', [canonical]);
}

export function getGroupLinksByCourse(courseId) {
  return all('SELECT * FROM group_links WHERE course_id=$1 ORDER BY id', [courseId]);
}

export function getGroupLinksByCourseAndInstructor(courseId, instructorNormalized) {
  return all('SELECT * FROM group_links WHERE course_id=$1 AND instructor_name_normalized=$2 ORDER BY id', [courseId, instructorNormalized]);
}

export function getUniqueInstructorsByCourse(courseId) {
  return all(
    'SELECT DISTINCT instructor_name, instructor_name_normalized FROM group_links WHERE course_id=$1 ORDER BY instructor_name',
    [courseId],
  );
}

export async function createGroupLink(url, canonicalUrl, courseId, instructorName, instructorNormalized, semesterId, submittedBy, approvedBy) {
  if (url && typeof url === 'object') {
    const o = url;
    url = o.url || o.raw_url || o.canonical_url;
    canonicalUrl = o.canonical_url;
    courseId = o.course_id;
    instructorNormalized = o.instructor_normalized || o.instructor_name_normalized;
    semesterId = o.semester_id;
    submittedBy = o.submitted_by;
    approvedBy = o.approved_by || null;
    instructorName = o.instructor_name || instructorNormalized;
  }

  const result = await run(
    `INSERT INTO group_links
      (url, canonical_url, course_id, instructor_name, instructor_name_normalized, semester_id, submitted_by, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
    [url, canonicalUrl, courseId, instructorName, instructorNormalized, semesterId, submittedBy, approvedBy],
  );
  return getGroupLink(result.rows[0].id);
}

export function deleteGroupLinksByCourse(courseId) {
  return run('DELETE FROM group_links WHERE course_id=$1', [courseId]);
}

// === SUBMISSIONS ===
export function getSubmission(id) {
  return get(`SELECT sub.*, sem.name AS semester_name
    FROM submissions sub LEFT JOIN semesters sem ON sem.id=sub.semester_id
    WHERE sub.id=$1`, [id]);
}

export function getSubmissionByCanonicalUrl(canonical) {
  return get(`SELECT sub.*, sem.name AS semester_name
    FROM submissions sub LEFT JOIN semesters sem ON sem.id=sub.semester_id
    WHERE sub.canonical_url=$1 AND sub.status IN ('pending','needs_user_edit')`, [canonical]);
}

export function getSubmissionsByStatus(status) {
  return all(`SELECT sub.*, sem.name AS semester_name
    FROM submissions sub LEFT JOIN semesters sem ON sem.id=sub.semester_id
    WHERE sub.status=$1 ORDER BY sub.created_at`, [status]);
}

export function getSubmissionsByUser(userId) {
  return all(`SELECT sub.*, sem.name AS semester_name
    FROM submissions sub LEFT JOIN semesters sem ON sem.id=sub.semester_id
    WHERE sub.submitted_by=$1 ORDER BY sub.created_at DESC LIMIT 20`, [userId]);
}

export async function createSubmission(url, canonicalUrl, courseId, courseName, instructorName, instructorNormalized, semesterId, semesterCode, submittedBy) {
  const result = await run(
    `INSERT INTO submissions
      (url, canonical_url, course_id, course_name, instructor_name, instructor_name_normalized, semester_id, semester_code, submitted_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING id`,
    [url, canonicalUrl, courseId, courseName, instructorName, instructorNormalized, semesterId, semesterCode, submittedBy],
  );
  return getSubmission(result.rows[0].id);
}

export function updateSubmissionStatus(id, status, feedback, reviewedBy) {
  return run(
    'UPDATE submissions SET status=$1, admin_feedback=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4',
    [status, feedback || '', reviewedBy, id],
  );
}

export function updateSubmissionMessageId(id, messageId) {
  return run('UPDATE submissions SET telegram_message_id=$1 WHERE id=$2', [messageId, id]);
}

export function updateSubmissionForEdit(id) {
  return run("UPDATE submissions SET status='needs_user_edit', updated_at=NOW() WHERE id=$1", [id]);
}

// === COURSE CHANGE REQUESTS ===
export function getCourseChangeRequest(id) {
  return get('SELECT * FROM course_change_requests WHERE id=$1', [id]);
}

export function getCourseChangeRequestsByStatus(status) {
  return all('SELECT * FROM course_change_requests WHERE status=$1 ORDER BY created_at', [status]);
}

export async function createCourseChangeRequest(requestType, courseId, courseName, proposedName, proposedNormalized, requestedBy) {
  const result = await run(
    `INSERT INTO course_change_requests
      (request_type, course_id, course_name, proposed_name, proposed_normalized_name, requested_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
    [requestType, courseId, courseName, proposedName, proposedNormalized, requestedBy],
  );
  return getCourseChangeRequest(result.rows[0].id);
}

export function updateCourseChangeRequestStatus(id, status, feedback, reviewedBy) {
  return run(
    'UPDATE course_change_requests SET status=$1, admin_feedback=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4',
    [status, feedback || '', reviewedBy, id],
  );
}

export function updateCourseChangeRequestMessageId(id, messageId) {
  return run('UPDATE course_change_requests SET telegram_message_id=$1 WHERE id=$2', [messageId, id]);
}

// === COURSE SUGGESTIONS ===
export function getCourseSuggestion(id) {
  return get('SELECT * FROM course_suggestions WHERE id=$1', [id]);
}

export function getCourseSuggestionsByStatus(status) {
  return all(`SELECT s.*, u.first_name AS suggested_by_name
    FROM course_suggestions s LEFT JOIN users u ON u.telegram_id=s.suggested_by
    WHERE s.status=$1 ORDER BY s.created_at`, [status]);
}

export async function createCourseSuggestion(courseName, normalizedName, suggestedBy) {
  const result = await run(
    `INSERT INTO course_suggestions (course_name, normalized_name, suggested_by, status)
     VALUES ($1,$2,$3,'pending') RETURNING id`,
    [courseName, normalizedName, suggestedBy],
  );
  return getCourseSuggestion(result.rows[0].id);
}

export function updateCourseSuggestionStatus(id, status, feedback, supervisorId, reviewedBy) {
  return run(
    `UPDATE course_suggestions SET status=$1, admin_feedback=$2, supervisor_id=$3,
      reviewed_by=$4, reviewed_at=NOW(), updated_at=NOW() WHERE id=$5`,
    [status, feedback || '', supervisorId, reviewedBy, id],
  );
}

// === SESSIONS ===
export async function getSession(userId) {
  const row = await get('SELECT * FROM user_sessions WHERE user_id=$1 AND expires_at > NOW()', [userId]);
  if (!row) return null;
  if (row.data) {
    try {
      const parsed = JSON.parse(row.data);
      if (parsed && typeof parsed === 'object') Object.assign(row, parsed);
    } catch (_) {
      // Keep the raw session when legacy/corrupt JSON is encountered.
    }
  }
  return row;
}

export async function createSession(userId, state, data, expirySec = 3600) {
  await run('DELETE FROM user_sessions WHERE user_id=$1', [userId]);
  return run(
    'INSERT INTO user_sessions (user_id, state, data, expires_at) VALUES ($1,$2,$3,NOW() + ($4 * INTERVAL \'1 second\'))',
    [userId, state, JSON.stringify(data || {}), expirySec],
  );
}

export async function updateSession(userId, stateOrData, data) {
  if (stateOrData && typeof stateOrData === 'object' && data === undefined) {
    const existing = await get('SELECT * FROM user_sessions WHERE user_id=$1', [userId]);
    let current = {};
    if (existing?.data) {
      try { current = JSON.parse(existing.data); } catch (_) { current = {}; }
    }
    const patch = stateOrData || {};
    const nextState = patch.state !== undefined ? patch.state : (existing ? existing.state : 'none');
    const nextData = { ...current, ...patch };
    delete nextData.state;
    if (!existing) {
      return run(
        'INSERT INTO user_sessions (user_id, state, data, expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL \'1 hour\')',
        [userId, nextState || 'none', JSON.stringify(nextData)],
      );
    }
    return run(
      'UPDATE user_sessions SET state=$1, data=$2, updated_at=NOW(), expires_at=NOW() + INTERVAL \'1 hour\' WHERE user_id=$3',
      [nextState || 'none', JSON.stringify(nextData), userId],
    );
  }
  return run(
    'UPDATE user_sessions SET state=$1, data=$2, updated_at=NOW(), expires_at=NOW() + INTERVAL \'1 hour\' WHERE user_id=$3',
    [stateOrData, JSON.stringify(data || {}), userId],
  );
}

export function deleteSession(userId) {
  return run('DELETE FROM user_sessions WHERE user_id=$1', [userId]);
}

export function cleanupExpiredSessions() {
  return run('DELETE FROM user_sessions WHERE expires_at <= NOW()');
}

// === AUDIT LOGS ===
export function audit(actorId, actorRole, action, targetType, targetId, oldValue, newValue) {
  return run(
    `INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorId, actorRole, action, targetType, targetId || 0, oldValue || '', newValue || ''],
  );
}

export function getAuditLogs(targetType, targetId, limit = 50) {
  if (targetType && targetId) {
    return all('SELECT * FROM audit_logs WHERE target_type=$1 AND target_id=$2 ORDER BY created_at DESC LIMIT $3', [targetType, targetId, limit]);
  }
  return all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
}

// === BOT SETTINGS ===
export async function getSetting(key) {
  const row = await get('SELECT value FROM bot_settings WHERE key=$1', [key]);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  return run(
    `INSERT INTO bot_settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, String(value ?? '')],
  );
}

// === Compatibility helpers used by handlers ===
export function getInstructor(courseId, normalized) {
  return get(
    'SELECT instructor_name AS name, instructor_name_normalized AS normalized FROM group_links WHERE course_id=$1 AND instructor_name_normalized=$2 LIMIT 1',
    [courseId, normalized],
  );
}

export async function getInstructorsForCourse(courseId) {
  const rows = await getUniqueInstructorsByCourse(courseId);
  return (rows || []).map((r) => ({ name: r.instructor_name, normalized: r.instructor_name_normalized }));
}

export function getSemestersForCourse(courseId, instructorNormalized) {
  return all(
    `SELECT DISTINCT s.* FROM semesters s
     INNER JOIN group_links g ON g.semester_id=s.id
     WHERE g.course_id=$1 AND g.instructor_name_normalized=$2 ORDER BY s.code DESC`,
    [courseId, instructorNormalized],
  );
}

export const findGroupLinkByCanonicalUrl = getGroupLinkByCanonicalUrl;

export async function getPendingSubmissions(opts = {}) {
  const rows = await getSubmissionsByStatus('pending');
  return rows.slice(0, opts.limit || 30);
}

export async function getPendingSuggestions(opts = {}) {
  const rows = await getCourseSuggestionsByStatus('pending');
  return rows.slice(0, opts.limit || 30);
}

export const getSuggestion = getCourseSuggestion;

export function updateSuggestion(id, data) {
  if (data && typeof data === 'object') {
    return run(
      `UPDATE course_suggestions SET
       status=COALESCE($1,status),
       admin_feedback=COALESCE($2,admin_feedback),
       supervisor_id=COALESCE($3,supervisor_id),
       reviewed_by=COALESCE($4,reviewed_by),
       reviewed_at=COALESCE($5,reviewed_at),
       updated_at=NOW() WHERE id=$6`,
      [data.status || null, data.admin_feedback ?? null, data.supervisor_id ?? null, data.reviewed_by ?? null, data.reviewed_at ?? null, id],
    );
  }
  return updateCourseSuggestionStatus(id, ...Array.from(arguments).slice(1));
}

export function updateSubmission(id, data) {
  if (data && typeof data === 'object') {
    return run(
      `UPDATE submissions SET
       status=COALESCE($1,status),
       admin_feedback=COALESCE($2,admin_feedback),
       reviewed_by=COALESCE($3,reviewed_by),
       reviewed_at=COALESCE($4,reviewed_at),
       updated_at=NOW() WHERE id=$5`,
      [data.status ?? null, data.admin_feedback ?? null, data.reviewed_by ?? null, data.reviewed_at ?? null, id],
    );
  }
  return updateSubmissionStatus(id, ...Array.from(arguments).slice(1));
}

export const updateUserRole = setRole;

export function createAuditLog(data = {}) {
  return audit(
    data.actor_id,
    data.actor_role || 'admin',
    data.action || 'unknown',
    data.target_type || 'user',
    data.target_id || 0,
    data.old_value || '',
    data.new_value || '',
  );
}

export function deleteGroupLinksForSemester(semesterId) {
  return run('DELETE FROM group_links WHERE semester_id=$1', [semesterId]);
}

export async function countGroupLinksForCourse(courseId) {
  const row = await get('SELECT COUNT(*)::int AS c FROM group_links WHERE course_id=$1', [courseId]);
  return row ? row.c : 0;
}

export async function countGroupLinksForSemester(semesterId) {
  const row = await get('SELECT COUNT(*)::int AS c FROM group_links WHERE semester_id=$1', [semesterId]);
  return row ? row.c : 0;
}

export async function getStats() {
  const result = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS "totalUsers",
      (SELECT COUNT(*)::int FROM courses) AS "totalCourses",
      (SELECT COUNT(*)::int FROM semesters) AS "totalSemesters",
      (SELECT COUNT(*)::int FROM group_links) AS "totalLinks",
      (SELECT COUNT(*)::int FROM submissions WHERE status='pending') AS "pendingSubmissions",
      (SELECT COUNT(*)::int FROM course_change_requests WHERE status='pending') AS "pendingCourseChanges",
      (SELECT COUNT(*)::int FROM course_suggestions WHERE status='pending') AS "pendingSuggestions",
      (SELECT COUNT(*)::int FROM users WHERE role='admin') AS "adminCount",
      (SELECT COUNT(*)::int FROM users WHERE role='coadmin') AS "coadminCount"
  `);
  return { ...result, supervisorCount: result.coadminCount };
}
