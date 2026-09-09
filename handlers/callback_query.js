'use strict';

// ─── dependencies ────────────────────────────────────────────────────────
import * as auth from '../lib/auth.js';
import * as db from '../lib/db.js';
import * as sessions from '../lib/sessions.js';
import * as config from '../lib/config.js';
import * as keyboards from '../lib/keyboards.js';
import * as messages from '../lib/messages.js';
import * as validation from '../lib/validation.js';
import * as workflows from '../lib/workflows.js';
import { bot, ensureUser } from '../lib/platform.js';
// ─── tiny helpers ────────────────────────────────────────────────────────

/** Safely answer callback – never throws (expired queries, etc.). */
async function safeAnswer(qid, text, showAlert) {
  try {
    await bot.answerCallbackQuery(qid, {
      text: text || '',
      show_alert: !!showAlert,
    });
  } catch (_) { /* expired / already answered */ }
}

/** Parse "prefix:arg1:arg2:…" into { prefix, parts }. */
function parseData(raw) {
  var parts = (raw || '').split(':');
  return { prefix: parts[0] || '', parts: parts };
}

async function isConfiguredGroup(chatId, settingKey) {
  var configured = await db.getSetting(settingKey);
  return !!configured && String(configured) === String(chatId);
}

// ─── keyboard factories ──────────────────────────────────────────────────

function mainMenuKeyboard(isAdminFlag) {
  var rows = [
    [
      { text: '🔍 جستجوی درس', callback_data: 'sc:0' },
      { text: '🔗 ارسال لینک',   callback_data: 'sl:0' },
    ],
    [
      { text: '💡 پیشنهاد درس', callback_data: 'sg:0' },
      { text: '❓ راهنما',       callback_data: 'hp:0' },
    ],
  ];
  if (isAdminFlag) {
    rows.push([{ text: '⚙️ پنل مدیریت', callback_data: 'ad:0' }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function adminPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👥 کاربران',     callback_data: 'ad:users' },
          { text: '📚 دروس',        callback_data: 'ad:courses' },
        ],
        [
          { text: '📅 ترم‌ها',      callback_data: 'ad:semesters' },
          { text: '📊 آمار',        callback_data: 'ad:stats' },
        ],
        [
          { text: '📝 درخواست‌ها',   callback_data: 'ad:requests' },
          { text: '💡 پیشنهادات',   callback_data: 'ad:suggestions' },
        ],
        [
          { text: '➕ افزودن درس',   callback_data: 'ad:cadd' },
          { text: '➕ افزودن ترم',   callback_data: 'ad:sadd' },
        ],
        [
          { text: '👥 گروه ناظران', callback_data: 'ad:supervisors' },
          { text: '👑 گروه مدیران', callback_data: 'ad:admins' },
        ],
        [{ text: '🏠 منوی اصلی',   callback_data: 'm:0' }],
      ],
    },
  };
}

function backKb(target) {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 برگشت', callback_data: target }]],
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// COURSE‑SEARCH FLOW
// ══════════════════════════════════════════════════════════════════════════

async function courseSelect(courseId, chatId, msgId, qid, userId) {
  var course = await db.getCourse(courseId);
  if (!course) {
    await safeAnswer(qid, 'درس یافت نشد', true);
    return;
  }
  await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_INSTRUCTOR, course_id: courseId, course_name: course.name });
  var instructors = await db.getInstructorsForCourse(courseId);
  if (!instructors || instructors.length === 0) {
    await bot.editMessageText(
      '📚 <b>' + course.name + '</b>\n\n👨‍🏫 نام استاد را ارسال کنید:',
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
        reply_markup: backKb('sc:0') },
    );
    await safeAnswer(qid);
    return;
  }
  var rows = instructors.map(function (inst) {
    return [{ text: inst.name, callback_data: 'is:' + courseId + ':' + inst.normalized }];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'sc:0' }]);

  await bot.editMessageText(
    '📚 درس: <b>' + course.name + '</b>\n\n👨‍🏫 استاد مورد نظر را انتخاب کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function instructorSelect(courseId, normalizedInstructor, chatId, msgId, qid, userId) {
  var course = await db.getCourse(courseId);
  var instructor = await db.getInstructor(courseId, normalizedInstructor);
  if (!course || !instructor) {
    await safeAnswer(qid, 'اطلاعات یافت نشد', true);
    return;
  }
  // persist selection in session
  await db.updateSession(userId, {
    state: config.SESSION_STATE.AWAITING_SEMESTER,
    course_id: courseId, course_name: course.name, instructor_name: instructor.name,
    instructor_normalized: normalizedInstructor,
    courseId: courseId, courseName: course.name, instructorName: instructor.name, normalizedInstructor: normalizedInstructor,
  });

  var semesters = await db.getSemestersForCourse(courseId, normalizedInstructor);
  if (!semesters || semesters.length === 0) semesters = await db.getActiveSemesters();
  if (!semesters || semesters.length === 0) {
    await bot.editMessageText(
      '📭 هیچ ترم فعالی برای ثبت لینک وجود ندارد.',
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('cs:' + courseId) },
    );
    await safeAnswer(qid);
    return;
  }
  var rows = semesters.map(function (s) {
    return [{ text: s.name, callback_data: 'ss:' + s.id }];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'cs:' + courseId }]);

  await bot.editMessageText(
    '📚 <b>' + course.name + '</b> — 👨‍🏫 <b>' + instructor.name + '</b>\n\n📅 ترم مورد نظر را انتخاب کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function semesterSelect(semesterId, chatId, msgId, qid, userId) {
  var semester = await db.getSemester(semesterId);
  if (!semester) {
    await safeAnswer(qid, 'ترم یافت نشد', true);
    return;
  }
  var session = await db.getSession(userId);
  if (!session || !session.courseId || !session.instructorName) {
    await bot.editMessageText(
      '⚠️ جلسه شما منقضی شده است. لطفاً دوباره شروع کنید.',
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
        ...mainMenuKeyboard(auth.isAdmin(session || {})) },
    );
    await safeAnswer(qid, 'جلسه منقضی شده', true);
    return;
  }
  await db.updateSession(userId, {
    state: config.SESSION_STATE.AWAITING_LINK,
    semester_id: semester.id, semester_name: semester.name, semester_code: semester.code,
    semesterId: semester.id, semesterName: semester.name,
  });
  await bot.editMessageText(
    '📚 <b>' + session.courseName + '</b>\n' +
    '👨‍🏫 <b>' + session.instructorName + '</b>\n' +
    '📅 <b>' + semester.name + '</b>\n\n' +
    '🔗 لینک گروه تلگرام را ارسال کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: backKb('is:' + session.courseId + ':' + (session.normalizedInstructor || '')) },
  );
  await safeAnswer(qid);
}

// ══════════════════════════════════════════════════════════════════════════
// SUBMISSION MODERATION
// ══════════════════════════════════════════════════════════════════════════

async function approveSubmission(submissionId, chatId, msgId, qid, userId, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var sub = await db.getSubmission(submissionId);
  if (!sub) {
    await safeAnswer(qid, 'درخواست یافت نشد', true);
    return;
  }
  if (sub.status !== 'pending') {
    await safeAnswer(qid, 'این درخواست قبلاً بررسی شده', true);
    return;
  }
  // duplicate canonical_url check
  var dup = await db.findGroupLinkByCanonicalUrl(sub.canonical_url);
  if (dup) {
    await bot.editMessageText(
      '⚠️ این لینک قبلاً ثبت شده است.\n\n🔗 <code>' + sub.canonical_url + '</code>',
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' },
    );
    await safeAnswer(qid, 'لینک تکراری', true);
    return;
  }
  // create group link
  await db.createGroupLink({
    course_id: sub.course_id,
    instructor_name: sub.instructor_name,
    instructor_normalized: sub.instructor_name_normalized,
    semester_id: sub.semester_id,
    canonical_url: sub.canonical_url,
    raw_url: sub.url,
    submitted_by: sub.submitted_by,
    created_at: new Date().toISOString(),
  });
  // update submission status
  await db.updateSubmission(submissionId, {
    status: 'approved',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });
  // notify submitter
  try {
    await bot.sendMessage(sub.submitted_by,
      '✅ لینک شما تأیید شد!\n\n📚 <b>' + (sub.course_name || 'درس') + '</b>\n🔗 <code>' + sub.canonical_url + '</code>',
      { parse_mode: 'HTML' },
    );
  } catch (_) { /* user may have blocked */ }
  // update moderation message
  var reviewerName = userObj.first_name || userObj.username || String(userId);
  await bot.editMessageText(
    '✅ <b>تأیید شد</b>\n\n' +
    '📚 ' + (sub.course_name || '—') + '\n' +
    '👨‍🏫 ' + (sub.instructor_name || '—') + '\n' +
    '📅 ' + (sub.semester_name || '—') + '\n' +
    '🔗 <code>' + sub.canonical_url + '</code>\n\n' +
    '👤 تأیید شده توسط: ' + reviewerName,
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' },
  );
  await safeAnswer(qid, '✅ تأیید شد');
}

async function rejectSubmission(submissionId, chatId, msgId, qid, userId, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var sub = await db.getSubmission(submissionId);
  if (!sub) {
    await safeAnswer(qid, 'درخواست یافت نشد', true);
    return;
  }
  if (sub.status !== 'pending') {
    await safeAnswer(qid, 'این درخواست قبلاً بررسی شده', true);
    return;
  }
  await db.updateSession(userId, {
    state: config.SESSION_STATE.AWAITING_REJECTION_REASON,
    submission_id: submissionId,
  });
  await bot.editMessageText(
    '❌ <b>رد لینک</b>\n\n📝 دلیل رد را ارسال کنید (یا /cancel برای لغو):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: backKb('m:0') },
  );
  await safeAnswer(qid);
}

async function replySubmission(submissionId, chatId, msgId, qid, userId, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var sub = await db.getSubmission(submissionId);
  if (!sub) {
    await safeAnswer(qid, 'درخواست یافت نشد', true);
    return;
  }
  await db.updateSession(userId, {
    state: config.SESSION_STATE.AWAITING_REPLY_MESSAGE,
    submission_id: submissionId,
  });
  await bot.editMessageText(
    '💬 <b>پاسخ به درخواست</b>\n\n📝 متن پاسخ را ارسال کنید (یا /cancel برای لغو):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: backKb('m:0') },
  );
  await safeAnswer(qid);
}

// ══════════════════════════════════════════════════════════════════════════
// COURSE SUGGESTIONS
// ══════════════════════════════════════════════════════════════════════════

async function approveSuggestion(suggestionId, chatId, msgId, qid, userId, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var sug = await db.getSuggestion(suggestionId);
  if (!sug || sug.status !== 'pending') {
    await safeAnswer(qid, sug ? 'این پیشنهاد قبلاً بررسی شده' : 'پیشنهاد یافت نشد', true);
    return;
  }

  // COADMIN/SUPERVISOR approval is a review step only. The course is created
  // only after an ADMIN performs the final approval in ADMIN_ONLY.
  if (userObj.role === config.ROLES.COADMIN) {
    if (sug.supervisor_id) {
      await safeAnswer(qid, 'این پیشنهاد قبلاً برای مدیر ارسال شده', true);
      return;
    }
    await db.updateSuggestion(suggestionId, {
      supervisor_id: userId,
      admin_feedback: 'تأیید ناظر؛ در انتظار تأیید مدیر',
    });
    await db.audit(
      userId, userObj.role, 'suggest_course_supervisor_approve',
      'course_suggestion', suggestionId, '', 'supervisor_approved'
    );

    var adminGroupId = await db.getSetting('admin_only_group_id');
    if (adminGroupId) {
      try {
        await bot.sendMessage(parseInt(adminGroupId, 10),
          '💡 <b>پیشنهاد درس برای تأیید نهایی</b>\n\n📚 ' +
          messages.escapeHtml(sug.course_name) + '\n👤 ناظر: ' +
          messages.escapeHtml(userObj.first_name || userObj.username || String(userId)),
          { parse_mode: 'HTML', reply_markup: keyboards.suggestionActions(suggestionId) }
        );
      } catch (_) {}
    }

    await bot.editMessageText(
      '🛡️ <b>پیشنهاد به مدیر ارسال شد</b>\n\n📚 ' + messages.escapeHtml(sug.course_name),
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
    );
    await safeAnswer(qid, 'برای تأیید نهایی به مدیر ارسال شد');
    return;
  }

  // ADMIN final approval.
  var newCourse = await db.createCourse(sug.course_name, sug.normalized_name);
  await db.updateSuggestion(suggestionId, {
    status: 'approved',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });
  await db.audit(
    userId, userObj.role, 'suggest_course_admin_approve',
    'course_suggestion', suggestionId, 'pending', 'approved'
  );

  try {
    await bot.sendMessage(sug.suggested_by,
      '✅ درس پیشنهادی شما تأیید شد!\n\n📚 <b>' + messages.escapeHtml(sug.course_name) + '</b>',
      { parse_mode: 'HTML' },
    );
  } catch (_) {}

  await bot.editMessageText(
    '✅ <b>پیشنهاد تأیید و درس ایجاد شد</b>\n\n📚 ' + messages.escapeHtml(sug.course_name) +
    '\n👤 مدیر: ' + messages.escapeHtml(userObj.first_name || userObj.username || String(userId)),
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' },
  );
  await safeAnswer(qid, '✅ درس ایجاد شد');
}


async function rejectSuggestion(suggestionId, chatId, msgId, qid, userId, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var sug = await db.getSuggestion(suggestionId);
  if (!sug) {
    await safeAnswer(qid, 'پیشنهاد یافت نشد', true);
    return;
  }
  if (sug.status !== 'pending') {
    await safeAnswer(qid, 'این پیشنهاد قبلاً بررسی شده', true);
    return;
  }
  await db.updateSuggestion(suggestionId, {
    status: 'rejected',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });
  try {
    await bot.sendMessage(sug.suggested_by,
      '❌ درس پیشنهادی شما رد شد.\n\n📚 <b>' + sug.course_name + '</b>\n💬 در صورت نیاز با مدیران تماس بگیرید.',
      { parse_mode: 'HTML' },
    );
  } catch (_) { /* blocked */ }
  await bot.editMessageText(
    '❌ <b>پیشنهاد رد شد</b>\n\n📚 ' + sug.course_name +
    '\n👤 رد شده توسط: ' + (userObj.first_name || userObj.username || String(userId)),
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' },
  );
  await safeAnswer(qid, '❌ رد شد');
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN PANEL HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function adminUsers(chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var users = await db.getAllUsers({ limit: 50 });
  if (!users || users.length === 0) {
    await bot.editMessageText('📭 هیچ کاربری ثبت نشده.', {
      chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard(),
    });
    await safeAnswer(qid);
    return;
  }
  var lines = users.map(function (u, i) {
    var name = u.first_name || u.username || ('#' + u.telegram_id);
    var role = u.role || 'user';
    var emoji = role === 'admin' ? '👑' : role === 'coadmin' ? '🛡️' : '👤';
    return (i + 1) + '. ' + emoji + ' ' + name + ' — <code>' + role + '</code> [<a href="tg://user?id=' + u.id + '">پروفایل</a>]';
  });
  await bot.editMessageText(
    '👥 <b>لیست کاربران</b> (' + users.length + ')\n\n' + lines.join('\n'),
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', disable_web_page_preview: true, ...adminPanelKeyboard() },
  );
  await safeAnswer(qid);
}

async function adminCourses(chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var courses = await db.getAllCourses({ limit: 50 });
  if (!courses || courses.length === 0) {
    await bot.editMessageText('📭 هیچ درسی ثبت نشده.', {
      chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard(),
    });
    await safeAnswer(qid);
    return;
  }
  var rows = courses.map(function (c) {
    return [{ text: c.name + '', callback_data: 'ad:cr:' + c.id }];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'ad:0' }]);
  await bot.editMessageText(
    '📚 <b>لیست دروس</b> (' + courses.length + ')\n\nدر مورد مدیریت روی درس کلیک کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function adminSemesters(chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var semesters = await db.getAllSemesters({ limit: 50 });
  if (!semesters || semesters.length === 0) {
    await bot.editMessageText('📭 هیچ ترمی ثبت نشده.', {
      chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard(),
    });
    await safeAnswer(qid);
    return;
  }
  var rows = semesters.map(function (s) {
    return [{ text: s.name, callback_data: 'ad:sr:' + s.id }];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'ad:0' }]);
  await bot.editMessageText(
    '📅 <b>لیست ترم‌ها</b> (' + semesters.length + ')\n\nدر مورد مدیریت روی ترم کلیک کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function adminCourseDetail(courseId, chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var course = await db.getCourse(courseId);
  if (!course) {
    await safeAnswer(qid, 'درس یافت نشد', true);
    return;
  }
  var linksCount = await db.countGroupLinksForCourse(courseId);
  var instructors = await db.getInstructorsForCourse(courseId);
  var names = (instructors || []).map(function (i) { return i.name; }).join(', ') || '—';

  await bot.editMessageText(
    '📚 <b>جزئیات درس</b>\n\nنام: <b>' + course.name + '</b>\n' +
    
    'تعداد لینک‌ها: ' + linksCount + '\nاساتید: ' + names,
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'ad:courses' }]] } },
  );
  await safeAnswer(qid);
}

async function adminSemesterDetail(semesterId, chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var semester = await db.getSemester(semesterId);
  if (!semester) {
    await safeAnswer(qid, 'ترم یافت نشد', true);
    return;
  }
  var linksCount = await db.countGroupLinksForSemester(semesterId);

  await bot.editMessageText(
    '📅 <b>جزئیات ترم</b>\n\nنام: <b>' + semester.name + '</b>\n' +
    'سال: ' + (semester.year || '—') + '\n' +
    'تعداد لینک‌ها: ' + linksCount,
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '🗑️ حذف ترم', callback_data: 'cd:' + semesterId }],
        [{ text: '🔙 برگشت', callback_data: 'ad:semesters' }],
      ] } },
  );
  await safeAnswer(qid);
}

async function confirmDeleteSemester(semesterId, chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var semester = await db.getSemester(semesterId);
  if (!semester) {
    await safeAnswer(qid, 'ترم یافت نشد', true);
    return;
  }
  await db.deleteGroupLinksForSemester(semesterId);
  await db.deleteSemester(semesterId);

  await bot.editMessageText(
    '✅ <b>ترم حذف شد</b>\n\n📅 ' + semester.name + '\n🗑️ تمام لینک‌های مرتبط نیز حذف شدند.',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'ad:semesters' }]] } },
  );
  await safeAnswer(qid, '✅ ترم حذف شد');
}

async function adminRequests(chatId, msgId, qid, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var pending = await db.getPendingSubmissions({ limit: 30 });
  if (!pending || pending.length === 0) {
    await bot.editMessageText('📭 هیچ درخواست در انتظار تأیید وجود ندارد.', {
      chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard(),
    });
    await safeAnswer(qid);
    return;
  }
  var lines = pending.map(function (r, i) {
    return (i + 1) + '. <b>' + (r.course_name || '—') + '</b> — ' + (r.instructor_name || '—') + '\n🔗 <code>' + r.canonical_url + '</code>';
  });
  var rows = pending.map(function (r) {
    return [{ text: '✅ ' + (r.course_name || 'لینک'), callback_data: 'ap:sub:' + r.id }];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'ad:0' }]);

  await bot.editMessageText(
    '📝 <b>درخواست‌های در انتظار</b> (' + pending.length + ')\n\n' + lines.join('\n\n'),
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function adminSuggestions(chatId, msgId, qid, userObj) {
  if (!auth.canModerate(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var pending = await db.getPendingSuggestions({ limit: 30 });
  if (!pending || pending.length === 0) {
    await bot.editMessageText('📭 هیچ پیشنهاد در انتظار بررسی وجود ندارد.', {
      chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard(),
    });
    await safeAnswer(qid);
    return;
  }
  var lines = pending.map(function (s, i) {
    return (i + 1) + '. 📚 <b>' + s.course_name + '</b>' + (s.course_code ? ' (' + s.course_code + ')' : '') +
      '\n👤 پیشنهاددهنده: ' + (s.suggested_by_name || '—');
  });
  var rows = pending.map(function (s) {
    return [
      { text: '✅ ' + s.course_name, callback_data: 'sgs:ap:' + s.id },
      { text: '❌', callback_data: 'sgs:rj:' + s.id },
    ];
  });
  rows.push([{ text: '🔙 برگشت', callback_data: 'ad:0' }]);

  await bot.editMessageText(
    '💡 <b>پیشنهادات در انتظار</b> (' + pending.length + ')\n\n' + lines.join('\n\n'),
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: { inline_keyboard: rows } },
  );
  await safeAnswer(qid);
}

async function adminStats(chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var stats = await db.getStats();
  await bot.editMessageText(
    '📊 <b>آمار سیستم</b>\n\n' +
    '👥 کل کاربران: <b>' + (stats.totalUsers || 0) + '</b>\n' +
    '📚 کل دروس: <b>' + (stats.totalCourses || 0) + '</b>\n' +
    '📅 کل ترم‌ها: <b>' + (stats.totalSemesters || 0) + '</b>\n' +
    '🔗 کل لینک‌ها: <b>' + (stats.totalLinks || 0) + '</b>\n' +
    '📝 درخواست‌های در انتظار: <b>' + (stats.pendingSubmissions || 0) + '</b>\n' +
    '💡 پیشنهادات در انتظار: <b>' + (stats.pendingSuggestions || 0) + '</b>\n' +
    '👑 مدیران: <b>' + (stats.adminCount || 0) + '</b>\n' +
    '🛡️ ناظران: <b>' + (stats.supervisorCount || 0) + '</b>',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard() },
  );
  await safeAnswer(qid);
}

async function userRoleMenu(targetUserId, chatId, msgId, qid, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var target = await db.getUser(targetUserId);
  if (!target) {
    await safeAnswer(qid, 'کاربر یافت نشد', true);
    return;
  }
  var name = target.first_name || target.username || ('#' + targetUserId);
  var role = target.role || 'user';

  await bot.editMessageText(
    '👤 <b>تغییر نقش کاربر</b>\n\nنام: <b>' + name + '</b>\nشناسه: <code>' + targetUserId + '</code>\nنقش فعلی: <b>' + role + '</b>\n\nنقش جدید را انتخاب کنید:',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [
          { text: '👤 کاربر عادی', callback_data: 'ad:role:' + targetUserId + ':user' },
          { text: '🛡️ ناظر',      callback_data: 'ad:role:' + targetUserId + ':coadmin' },
          { text: '👑 مدیر',       callback_data: 'ad:role:' + targetUserId + ':admin' },
        ],
        [{ text: '🔙 برگشت', callback_data: 'ad:users' }],
      ] } },
  );
  await safeAnswer(qid);
}

async function setRole(targetUserId, newRole, chatId, msgId, qid, userId, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  var valid = ['user', 'coadmin', 'admin'];
  if (valid.indexOf(newRole) === -1) {
    await safeAnswer(qid, 'نقش نامعتبر', true);
    return;
  }
  var target = await db.getUser(targetUserId);
  if (!target) {
    await safeAnswer(qid, 'کاربر یافت نشد', true);
    return;
  }
  if (config.INITIAL_ADMIN_IDS.indexOf(targetUserId) !== -1 && newRole !== 'admin') {
    await safeAnswer(qid, '⛔ مدیر اولیه قابل تنزل نیست', true);
    return;
  }
  var oldRole = target.role || 'user';
  await db.updateUserRole(targetUserId, newRole);
  await db.createAuditLog({
    action: 'role_change',
    actor_id: userId,
    target_id: targetUserId,
    old_value: oldRole,
    new_value: newRole,
    created_at: new Date().toISOString(),
  });
  var name = target.first_name || target.username || ('#' + targetUserId);
  var actorName = userObj.first_name || userObj.username || String(userId);

  await bot.editMessageText(
    '✅ <b>نقش با موفقیت تغییر کرد</b>\n\n' +
    '👤 کاربر: <b>' + name + '</b>\n' +
    '🔄 نقش قدیم: <code>' + oldRole + '</code>\n' +
    '🆕 نقش جدید: <code>' + newRole + '</code>\n\n' +
    '📝 تغییردهنده: ' + actorName,
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'ad:users' }]] } },
  );
  await safeAnswer(qid, 'نقش به ' + newRole + ' تغییر کرد');
}

async function addCourse(chatId, msgId, qid, userId, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_ADMIN_COURSE_NAME });
  await bot.editMessageText(
    '➕ <b>افزودن درس جدید</b>\n\n📝 نام درس را ارسال کنید (یا /cancel برای لغو):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('ad:0') },
  );
  await safeAnswer(qid);
}

async function addSemester(chatId, msgId, qid, userId, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  await db.updateSession(userId, { state: 'awaiting_semester_name' });
  await bot.editMessageText(
    '➕ <b>افزودن ترم جدید</b>\n\n📝 نام ترم را ارسال کنید (مثلاً: ۱۴۰۳-۱) (یا /cancel برای لغو):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('ad:0') },
  );
  await safeAnswer(qid);
}

async function setSupervisorsGroup(chatId, msgId, qid, userId, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_SETTINGS_VALUE, setting_key: 'supervisors_group_id' });
  await bot.editMessageText(
    '👥 <b>تنظیم گروه ناظران</b>\n\nشناسه گروه جدید را ارسال کنید (یا 0 برای حذف):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('ad:0') },
  );
  await safeAnswer(qid);
}

async function setAdminsGroup(chatId, msgId, qid, userId, userObj) {
  if (!auth.isAdmin(userObj)) {
    await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
    return;
  }
  await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_SETTINGS_VALUE, setting_key: 'admin_only_group_id' });
  await bot.editMessageText(
    '👑 <b>تنظیم گروه مدیران</b>\n\nشناسه گروه جدید را ارسال کنید (یا 0 برای حذف):',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('ad:0') },
  );
  await safeAnswer(qid);
}

async function courseChangeRequest(type, chatId, msgId, qid, userId) {
  if (type !== 'name' && type !== 'rename') {
    await safeAnswer(qid, 'در حال حاضر فقط تغییر نام درس پشتیبانی می‌شود', true);
    return;
  }
  await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_COURSE_CHANGE_NAME, request_type: 'rename' });
  await bot.editMessageText(
    '📝 <b>درخواست تغییر نام درس</b>\n\nنام جدید درس را ارسال کنید:\n(یا /cancel برای لغو)',
    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('m:0') },
  );
  await safeAnswer(qid);
}

async function genericActionResults(action, chatId, msgId, qid, userId) {
  if (action === 'search_results') {
    var session = await db.getSession(userId);
    if (!session || !session.searchResults || session.searchResults.length === 0) {
      await bot.editMessageText('📭 نتیجه‌ای یافت نشد.', {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...mainMenuKeyboard(),
      });
      await safeAnswer(qid);
      return;
    }
    var results = session.searchResults;
    var lines = results.map(function (r, i) {
      return (i + 1) + '. 📚 <b>' + r.name + '</b>' + (r.code ? ' (' + r.code + ')' : '');
    });
    var rows = results.map(function (r) {
      return [{ text: r.name, callback_data: 'cs:' + r.id }];
    });
    rows.push([{ text: '🔙 برگشت', callback_data: 'm:0' }]);

    await bot.editMessageText(
      '🔍 <b>نتایج جستجو</b> (' + results.length + ')\n\n' + lines.join('\n'),
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } },
    );
    await safeAnswer(qid);
  } else {
    await safeAnswer(qid, 'عملیات ناشناخته', true);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN EXPORTED HANDLER
// ══════════════════════════════════════════════════════════════════════════

async function handleCallbackQuery(callbackQuery, user, botOverride) {
  var cq       = callbackQuery;
  var chatId   = cq.message ? cq.message.chat.id : null;
  var msgId    = cq.message ? cq.message.message_id : null;
  var qid      = cq.id;
  var userId   = cq.from.id;
  var data     = cq.data || '';
  var userObj  = user;   // DB user row (server‑verified)
  var bot = botOverride;

  var parsed = parseData(data);
  var prefix = parsed.prefix;
  var parts  = parsed.parts;

  try {

    // ────────────── MAIN MENU ──────────────
    if (prefix === 'm') {
      await bot.editMessageText(
        '🏠 <b>منوی اصلی</b>\n\nخوش آمدید! لطفاً یکی از گزینه‌ها را انتخاب کنید:',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...mainMenuKeyboard(auth.isAdmin(userObj)) },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── SEARCH COURSE ──────────────
    if (prefix === 'sc') {
      await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_COURSE });
      await bot.editMessageText(
        '🔍 <b>جستجوی درس</b>\n\n📝 نام درس یا کد آن را تایپ کنید:',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('m:0') },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── SUBMIT LINK ──────────────
    if (prefix === 'sl') {
      await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_LINK });
      await bot.editMessageText(
        '🔗 <b>ارسال لینک گروه</b>\n\n📝 لینک گروه تلگرام را ارسال کنید:\n\n⏰ جلسه شما ۵ دقیقه اعتبار دارد.\n(یا /cancel برای لغو)',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('m:0') },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── SUGGEST COURSE ──────────────
    if (prefix === 'sg') {
      await db.updateSession(userId, { state: config.SESSION_STATE.AWAITING_SUGGESTION_NAME });
      await bot.editMessageText(
        '💡 <b>پیشنهاد درس جدید</b>\n\n📝 نام درس پیشنهادی را ارسال کنید:\n\n(یا /cancel برای لغو)',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backKb('m:0') },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── HELP ──────────────
    if (prefix === 'hp') {
      await bot.editMessageText(
        '❓ <b>راهنمای ربات</b>\n\n' +
        '🔹 <b>جستجوی درس</b> — گروه تلگرام درس مورد نظرتان را پیدا کنید\n' +
        '🔹 <b>ارسال لینک</b> — لینک گروه درسی را برای تأیید ارسال کنید\n' +
        '🔹 <b>پیشنهاد درس</b> — درسی که در ربات نیست پیشنهاد دهید\n\n📞 پشتیبانی: @support',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...mainMenuKeyboard(auth.isAdmin(userObj)) },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── CANCEL ──────────────
    if (prefix === 'ca') {
      await db.updateSession(userId, {
        state: null, courseId: null, courseName: null,
        instructorName: null, normalizedInstructor: null,
        semesterId: null, semesterName: null, pendingSubmissionId: null,
      });
      await bot.editMessageText(
        '✅ عملیات لغو شد.\n\n🏠 منوی اصلی:',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...mainMenuKeyboard(auth.isAdmin(userObj)) },
      );
      await safeAnswer(qid, 'لغو شد');
      return;
    }

    // ────────────── COURSE SELECT ──────────────
    if (prefix === 'cs') {
      var courseId = parts[1];
      if (!courseId) { await safeAnswer(qid, 'شناسه نامعتبر', true); return; }
      await courseSelect(courseId, chatId, msgId, qid, userId);
      return;
    }

    // ────────────── INSTRUCTOR SELECT ──────────────
    if (prefix === 'is') {
      var isCourseId = parts[1];
      var normalizedInstr = parts.slice(2).join(':');
      if (!isCourseId || !normalizedInstr) { await safeAnswer(qid, 'اطلاعات نامعتبر', true); return; }
      await instructorSelect(isCourseId, normalizedInstr, chatId, msgId, qid, userId);
      return;
    }

    // ────────────── SEMESTER SELECT ──────────────
    if (prefix === 'ss') {
      var semId = parts[1];
      if (!semId) { await safeAnswer(qid, 'شناسه نامعتبر', true); return; }
      await semesterSelect(semId, chatId, msgId, qid, userId);
      return;
    }

    // ────────────── APPROVE SUBMISSION ──────────────
    if (prefix === 'ap') {
      if (!(auth.canModerate(userObj) && (await isConfiguredGroup(chatId, 'supervisors_group_id') || (cq.message && cq.message.chat.type === 'private')))) {
        await safeAnswer(qid, '⛔ این عملیات در این گفتگو مجاز نیست', true);
        return;
      }
      if (parts[1] === 'sub' && parts[2]) {
        await approveSubmission(parts[2], chatId, msgId, qid, userId, userObj);
      } else {
        await safeAnswer(qid, 'عملیات نامعتبر', true);
      }
      return;
    }

    // ────────────── REJECT SUBMISSION ──────────────
    if (prefix === 'rj') {
      if (!(auth.canModerate(userObj) && (await isConfiguredGroup(chatId, 'supervisors_group_id') || (cq.message && cq.message.chat.type === 'private')))) {
        await safeAnswer(qid, '⛔ این عملیات در این گفتگو مجاز نیست', true);
        return;
      }
      if (parts[1] === 'sub' && parts[2]) {
        await rejectSubmission(parts[2], chatId, msgId, qid, userId, userObj);
      } else {
        await safeAnswer(qid, 'عملیات نامعتبر', true);
      }
      return;
    }

    // ────────────── REPLY TO SUBMISSION ──────────────
    if (prefix === 'rp') {
      if (!(auth.canModerate(userObj) && (await isConfiguredGroup(chatId, 'supervisors_group_id') || (cq.message && cq.message.chat.type === 'private')))) {
        await safeAnswer(qid, '⛔ این عملیات در این گفتگو مجاز نیست', true);
        return;
      }
      if (parts[1] === 'sub' && parts[2]) {
        await replySubmission(parts[2], chatId, msgId, qid, userId, userObj);
      } else {
        await safeAnswer(qid, 'عملیات نامعتبر', true);
      }
      return;
    }

    // ────────────── CONFIRM DELETE SEMESTER ──────────────
    if (prefix === 'cd') {
      var cdSemId = parts[1];
      if (!cdSemId) { await safeAnswer(qid, 'شناسه نامعتبر', true); return; }

      // cd:{semesterId}:confirm → actually delete
      if (parts[2] === 'confirm') {
        await confirmDeleteSemester(cdSemId, chatId, msgId, qid, userObj);
        return;
      }

      // cd:{semesterId} → show confirmation dialog
      if (!auth.isAdmin(userObj)) {
        await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
        return;
      }
      var semForConfirm = await db.getSemester(cdSemId);
      if (!semForConfirm) { await safeAnswer(qid, 'ترم یافت نشد', true); return; }
      var confirmLinksCount = await db.countGroupLinksForSemester(cdSemId);

      await bot.editMessageText(
        '⚠️ <b>تأیید حذف ترم</b>\n\n' +
        '📅 ترم: <b>' + semForConfirm.name + '</b>\n' +
        '🔗 تعداد لینک‌ها: ' + confirmLinksCount + '\n\n' +
        '❗ آیا مطمئن هستید؟ تمام لینک‌های مرتبط حذف خواهند شد.',
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [
            [
              { text: '✅ بله، حذف شود', callback_data: 'cd:' + cdSemId + ':confirm' },
              { text: '❌ خیر، لغو',     callback_data: 'ad:sr:' + cdSemId },
            ],
          ] } },
      );
      await safeAnswer(qid);
      return;
    }

    // ────────────── COURSE CHANGE REQUEST ──────────────
    if (prefix === 'cc') {
      var ccType = parts[1];
      if (!ccType) { await safeAnswer(qid, 'نوع نامعتبر', true); return; }
      await courseChangeRequest(ccType, chatId, msgId, qid, userId);
      return;
    }

    // ────────────── SUGGESTION APPROVE / REJECT ──────────────
    if (prefix === 'sgs') {
      var suggestionGroupKey = auth.isAdmin(userObj) ? 'admin_only_group_id' : 'supervisors_group_id';
      if (!(auth.canModerate(userObj) && ((await isConfiguredGroup(chatId, suggestionGroupKey)) || (cq.message && cq.message.chat.type === 'private')))) {
        await safeAnswer(qid, '⛔ گفتگو مجاز برای این عملیات نیست', true);
        return;
      }
      var sgsAction = parts[1];
      var sgsId     = parts[2];
      if (!sgsAction || !sgsId) { await safeAnswer(qid, 'عملیات نامعتبر', true); return; }
      if (sgsAction === 'ap') {
        await approveSuggestion(sgsId, chatId, msgId, qid, userId, userObj);
      } else if (sgsAction === 'rj') {
        await rejectSuggestion(sgsId, chatId, msgId, qid, userId, userObj);
      } else {
        await safeAnswer(qid, 'عملیات نامعتبر', true);
      }
      return;
    }

    // ────────────── GENERIC ACTION ──────────────
    if (prefix === 'ac') {
      var acAction = parts[1];
      if (!acAction) { await safeAnswer(qid, 'عملیات نامعتبر', true); return; }
      await genericActionResults(acAction, chatId, msgId, qid, userId);
      return;
    }

    // ────────────── ADMIN PANEL ──────────────
    if (prefix === 'ad') {
      if (!cq.message || cq.message.chat.type !== 'private') {
        await safeAnswer(qid, '⛔ پنل مدیریت فقط در گفتگوی خصوصی قابل استفاده است', true);
        return;
      }
      var sub = parts[1] || '0';

      // ad:0 — main admin panel
      if (sub === '0' || sub === '') {
        if (!auth.isAdmin(userObj)) {
          await bot.editMessageText('⛔ شما دسترسی مدیریت ندارید.', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...mainMenuKeyboard(false),
          });
          await safeAnswer(qid, '⛔ دسترسی غیرمجاز', true);
          return;
        }
        await bot.editMessageText(
          '⚙️ <b>پنل مدیریت</b>\n\nلطفاً بخش مورد نظر را انتخاب کنید:',
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...adminPanelKeyboard() },
        );
        await safeAnswer(qid);
        return;
      }

      // ad:users
      if (sub === 'users') {
        await adminUsers(chatId, msgId, qid, userObj);
        return;
      }
      // ad:courses
      if (sub === 'courses') {
        await adminCourses(chatId, msgId, qid, userObj);
        return;
      }
      // ad:semesters
      if (sub === 'semesters') {
        await adminSemesters(chatId, msgId, qid, userObj);
        return;
      }
      // ad:supervisors
      if (sub === 'supervisors') {
        await setSupervisorsGroup(chatId, msgId, qid, userId, userObj);
        return;
      }
      // ad:admins
      if (sub === 'admins') {
        await setAdminsGroup(chatId, msgId, qid, userId, userObj);
        return;
      }
      // ad:requests
      if (sub === 'requests') {
        await adminRequests(chatId, msgId, qid, userObj);
        return;
      }
      // ad:suggestions
      if (sub === 'suggestions') {
        await adminSuggestions(chatId, msgId, qid, userObj);
        return;
      }
      // ad:stats
      if (sub === 'stats') {
        await adminStats(chatId, msgId, qid, userObj);
        return;
      }
      // ad:cadd
      if (sub === 'cadd') {
        await addCourse(chatId, msgId, qid, userId, userObj);
        return;
      }
      // ad:sadd
      if (sub === 'sadd') {
        await addSemester(chatId, msgId, qid, userId, userObj);
        return;
      }
      // ad:ur:{userId} — user role change menu
      if (sub === 'ur' && parts[2]) {
        var urUserId = parseInt(parts[2], 10);
        if (isNaN(urUserId)) { await safeAnswer(qid, 'شناسه نامعتبر', true); return; }
        await userRoleMenu(urUserId, chatId, msgId, qid, userObj);
        return;
      }
      // ad:role:{userId}:{role} — set role
      if (sub === 'role' && parts[2] && parts[3]) {
        var roleUserId = parseInt(parts[2], 10);
        if (isNaN(roleUserId)) { await safeAnswer(qid, 'شناسه نامعتبر', true); return; }
        await setRole(roleUserId, parts[3], chatId, msgId, qid, userId, userObj);
        return;
      }
      // ad:cr:{courseId} — course detail
      if (sub === 'cr' && parts[2]) {
        await adminCourseDetail(parts[2], chatId, msgId, qid, userObj);
        return;
      }
      // ad:sr:{semesterId} — semester detail
      if (sub === 'sr' && parts[2]) {
        await adminSemesterDetail(parts[2], chatId, msgId, qid, userObj);
        return;
      }

      // unknown admin sub
      await safeAnswer(qid, 'عملیات نامعتبر', true);
      return;
    }

    // ────────────── FALLBACK ──────────────
    await safeAnswer(qid, 'عملیات ناشناخته', true);

  } catch (err) {
    console.error('[callback_query] Error handling "' + data + '":', err);
    try {
      await bot.sendMessage(chatId, '❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.', { parse_mode: 'HTML' });
    } catch (_) { /* silent */ }
    await safeAnswer(qid, 'خطای داخلی', true);
  }
}

// ─── exports ─────────────────────────────────────────────────────────────


export default async function (callbackQuery) {
  if (!callbackQuery || !callbackQuery.from || !callbackQuery.from.id) {
    try { await bot.answerCallbackQuery(callbackQuery && callbackQuery.id); } catch (_) {}
    return;
  }
  const user = await ensureUser(callbackQuery.from);
  try {
    return await handleCallbackQuery(callbackQuery, user, bot);
  } catch (err) {
    console.error('[callback_query] handler error:', err);
    try {
      if (callbackQuery.message && callbackQuery.message.chat) {
        await bot.sendMessage(callbackQuery.message.chat.id, messages.error(), { parse_mode: 'HTML' });
      }
    } catch (_) {}
  }
}
