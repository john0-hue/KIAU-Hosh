// Application constants and environment-backed configuration.

const ROLES = {
  USER: 'user',
  COADMIN: 'coadmin',
  ADMIN: 'admin',
};

const SUBMISSION_STATUS = {
  PENDING: 'pending',
  NEEDS_USER_EDIT: 'needs_user_edit',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const SUGGESTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const SESSION_STATE = {
  NONE: 'none',
  AWAITING_COURSE: 'awaiting_course',
  AWAITING_COURSE_SELECT: 'awaiting_course_select',
  AWAITING_INSTRUCTOR: 'awaiting_instructor',
  AWAITING_INSTRUCTOR_SELECT: 'awaiting_instructor_select',
  AWAITING_SEMESTER: 'awaiting_semester',
  AWAITING_LINK: 'awaiting_link',
  AWAITING_SUGGESTION_NAME: 'awaiting_suggestion_name',
  AWAITING_REJECTION_REASON: 'awaiting_rejection_reason',
  AWAITING_REPLY_MESSAGE: 'awaiting_reply_message',
  AWAITING_EDIT_COURSE: 'awaiting_edit_course',
  AWAITING_EDIT_INSTRUCTOR: 'awaiting_edit_instructor',
  AWAITING_EDIT_SEMESTER: 'awaiting_edit_semester',
  AWAITING_EDIT_LINK: 'awaiting_edit_link',
  AWAITING_COURSE_CHANGE_REQUEST: 'awaiting_course_change_request',
  AWAITING_COURSE_CHANGE_NAME: 'awaiting_course_change_name',
  AWAITING_SEMESTER_DELETE_CONFIRM: 'awaiting_semester_delete_confirm',
  AWAITING_ADMIN_ROLE_TARGET: 'awaiting_admin_role_target',
  AWAITING_ADMIN_ROLE_NEW: 'awaiting_admin_role_new',
  AWAITING_ADMIN_COURSE_NAME: 'awaiting_admin_course_name',
  AWAITING_ADMIN_SEMESTER_NAME: 'awaiting_admin_semester_name',
  AWAITING_ADMIN_SEMESTER_CODE: 'awaiting_admin_semester_code',
  AWAITING_SETTINGS_VALUE: 'awaiting_settings_value',
};

const LIMITS = {
  COURSE_NAME: 150,
  INSTRUCTOR_NAME: 100,
  URL_MAX: 500,
  URL_MIN: 5,
  SEMESTER_NAME: 50,
  SEMESTER_CODE: 10,
  FEEDBACK: 1000,
  CALLBACK_DATA: 64,
};

const VALID_PROTOCOLS = ['http://', 'https://'];
const DEFAULT_LANG = 'fa';

const CB = {
  MENU: 'm', SEARCH_COURSE: 'sc', SUBMIT_LINK: 'sl', SUGGEST_COURSE: 'sg', HELP: 'hp', ADMIN: 'ad',
  COURSE_SELECT: 'cs', INSTRUCTOR_SELECT: 'is', SEMESTER_SELECT: 'ss', APPROVE: 'ap', REJECT: 'rj',
  REPLY: 'rp', CANCEL: 'ca', CONFIRM: 'cf', BACK: 'bk', ACTION: 'ac', CONFIRM_DELETE: 'cd',
  COURSE_CHANGE: 'cc', SUGGESTION: 'sgs', SETTINGS: 'st',
};

const INITIAL_ADMIN_IDS = String(process.env.INITIAL_ADMIN_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map(Number)
  .filter(Number.isSafeInteger);

export {
  ROLES, SUBMISSION_STATUS, REQUEST_STATUS, SUGGESTION_STATUS, SESSION_STATE,
  LIMITS, VALID_PROTOCOLS, DEFAULT_LANG, CB, INITIAL_ADMIN_IDS,
};
