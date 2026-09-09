// handlers/message.js — Main message handler for kiau-hoosh bot
// Handles text messages and commands. Receives (message, user, bot).

import * as db from '../lib/db.js';
import * as sessions from '../lib/sessions.js';
import * as config from '../lib/config.js';
import * as matching from '../lib/matching.js';
import * as validation from '../lib/validation.js';
import * as keyboards from '../lib/keyboards.js';
import * as messages from '../lib/messages.js';
import * as auth from '../lib/auth.js';
import * as workflows from '../lib/workflows.js';
import { bot, ensureUser } from '../lib/platform.js';
var SESSION_STATE = config.SESSION_STATE;
var ROLES = config.ROLES;
var CB = config.CB;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function send(b, chatId, text, options) {
  var opts = options || {};
  if (opts.parse_mode === undefined) opts.parse_mode = 'HTML';
  return b.sendMessage(chatId, text, opts);
}

function sendError(b, chatId) {
  return send(b, chatId, messages.error());
}

function sendCancelledAndMenu(b, chatId, user) {
  return send(b, chatId, messages.cancelled(), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

function formatSubmissionInfo(data) {
  var lines = [];
  if (data.course_name) lines.push('\uD83D\uDCDA \u062F\u0633: ' + data.course_name);
  if (data.instructor_name) lines.push('\uD83D\uDC68\u200D\uD83C\uDFEB \u0627\u0633\u062A\u0627\u062F: ' + data.instructor_name);
  if (data.semester_code) lines.push('\uD83D\uDCC5 \u062A\u0631\u0645: ' + data.semester_code);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
async function handleMessage(message, user, bot) {
  if (!message || !user) return;

  var chatId = message.chat.id;
  var text = (message.text || '').trim();
  var userId = user.telegram_id;

  // --- Command handling ---
  if (message.entities && message.entities.length > 0) {
    var cmdEntity = message.entities[0];
    if (cmdEntity.type === 'bot_command' && cmdEntity.offset === 0) {
      var command = text.substring(0, cmdEntity.length).toLowerCase();

      if (command === '/start') {
        return handleStart(bot, chatId, user);
      }
      if (command === '/cancel') {
        return handleCancel(bot, chatId, user);
      }
      if (command === '/help') {
        return handleHelp(bot, chatId, user);
      }
    }
  }

  if (!text) return;

  // --- Free text based on session state ---
  var session = await sessions.getSession(userId);
  if (!session || !sessions.isActive(session)) {
    return handleStart(bot, chatId, user);
  }

  var state = session.state;
  var data = sessions.parseData(session);

  try {
    switch (state) {
      case SESSION_STATE.AWAITING_COURSE:
        return await handleAwaitingCourse(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_INSTRUCTOR:
        return await handleAwaitingInstructor(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_LINK:
        return await handleAwaitingLink(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_SUGGESTION_NAME:
        return await handleAwaitingSuggestionName(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_REPLY_MESSAGE:
        return await handleAwaitingReplyMessage(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_EDIT_LINK:
        return await handleAwaitingEditLink(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_ADMIN_COURSE_NAME:
        return await handleAwaitingAdminCourseName(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_ADMIN_SEMESTER_NAME:
        return await handleAwaitingAdminSemesterName(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_ADMIN_SEMESTER_CODE:
        return await handleAwaitingAdminSemesterCode(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_ADMIN_ROLE_TARGET:
        return await handleAwaitingAdminRoleTarget(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_ADMIN_ROLE_NEW:
        return await handleAwaitingAdminRoleNew(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_SETTINGS_VALUE:
        return await handleAwaitingSettingsValue(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_REJECTION_REASON:
        return await handleAwaitingRejectionReason(bot, chatId, userId, text, data, user);

      case SESSION_STATE.AWAITING_COURSE_CHANGE_NAME:
        return await handleAwaitingCourseChangeName(bot, chatId, userId, text, data, user);

      default:
        await sessions.endSession(userId);
        return handleStart(bot, chatId, user);
    }
  } catch (err) {
    console.error('handleMessage error:', err);
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
async function handleStart(bot, chatId, user) {
  await sessions.endSession(user.telegram_id);
  return send(bot, chatId, messages.welcome(user), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// /cancel
// ---------------------------------------------------------------------------
async function handleCancel(bot, chatId, user) {
  await sessions.endSession(user.telegram_id);
  return sendCancelledAndMenu(bot, chatId, user);
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------
async function handleHelp(bot, chatId, user) {
  await sessions.endSession(user.telegram_id);
  return send(bot, chatId, messages.help(), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// AWAITING_COURSE — user types a course name to search
// ---------------------------------------------------------------------------
async function handleAwaitingCourse(bot, chatId, userId, text, data, user) {
  if (text.length < 2) {
    return send(bot, chatId, '\u26A0\uFE0F \u0644\u0637\u0641\u0627\u064B \u062D\u062F\u0627\u0642\u0644 ۲ \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var normalized = matching.normalizeText(text);
  var courses = await db.searchCourses(normalized);

  if (!courses || courses.length === 0) {
    // No match — offer to suggest
    await sessions.updateSession(userId, SESSION_STATE.AWAITING_SUGGESTION_NAME, {
      suggestion_name: text
    });
    return send(bot, chatId, messages.courseNotFound(text), {
      reply_markup: keyboards.suggestionConfirmButtons(normalized, 0)
    });
  }

  if (courses.length === 1) {
    // Single match — auto-select
    var course = courses[0];
    var instructors = await db.getUniqueInstructorsByCourse(course.id);

    if (instructors && instructors.length > 0) {
      // Show instructor selection
      await sessions.updateSession(userId, SESSION_STATE.AWAITING_INSTRUCTOR, {
        course_id: course.id,
        course_name: course.name,
        flow: data.flow || 'search'
      });
      return send(bot, chatId, messages.courseFound(course) + '\n\n' + messages.instructorPrompt(), {
        reply_markup: keyboards.instructorList(instructors, course.id)
      });
    }

    // No instructors — go to semester selection
    var semesters = await db.getActiveSemesters();
    if (semesters && semesters.length > 0) {
      await sessions.updateSession(userId, SESSION_STATE.AWAITING_SEMESTER, {
        course_id: course.id,
        course_name: course.name,
        flow: data.flow || 'search'
      });
      return send(bot, chatId, messages.courseFound(course) + '\n\n' + messages.semesterPrompt(), {
        reply_markup: keyboards.semesterList(semesters)
      });
    }

    await sessions.endSession(userId);
    return send(bot, chatId, '\u26A0\uFE0F \u062A\u0631\u0645 \u0641\u0639\u0627\u0644\u06CC \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Multiple matches — show list
  return send(bot, chatId, '\uD83D\uDD0D ' + courses.length + ' \u062F\u0633 \u067E\u06CC\u062F\u0627 \u0634\u062F:\n\n\u0644\u0637\u0641\u0627\u064B \u062F\u0633 \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F:', {
    reply_markup: keyboards.courseList(courses)
  });
}

// ---------------------------------------------------------------------------
// AWAITING_INSTRUCTOR — user types an instructor name
// ---------------------------------------------------------------------------
async function handleAwaitingInstructor(bot, chatId, userId, text, data, user) {
  if (text.length < 2) {
    return send(bot, chatId, '\u26A0\uFE0F \u0644\u0637\u0641\u0627\u064B \u062D\u062F\u0627\u0642\u0644 ۲ \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var courseId = data.course_id;
  if (!courseId) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  // Fetch existing instructors for this course
  var existingInstructors = await db.getUniqueInstructorsByCourse(courseId);
  var existingNames = [];
  for (var i = 0; i < existingInstructors.length; i++) {
    existingNames.push(existingInstructors[i].instructor_name);
  }

  var matchResult = matching.matchInstructorPartial(text, existingNames);

  if (matchResult.type === 'exact') {
    // Auto-select — advance to semester
    var instructorName = matchResult.name;
    var instructorNormalized = matching.normalizeInstructor(instructorName);

    var semesters = await db.getActiveSemesters();
    if (semesters && semesters.length > 0) {
      await sessions.updateSession(userId, SESSION_STATE.AWAITING_SEMESTER, {
        course_id: data.course_id,
        course_name: data.course_name,
        instructor_name: instructorName,
        instructor_normalized: instructorNormalized,
        flow: data.flow || 'search'
      });
      return send(bot, chatId, '\uD83D\uDC68\u200D\uD83C\uDFEB \u0627\u0633\u062A\u0627\u062F: <b>' + instructorName + '</b>\n\n' + messages.semesterPrompt(), {
        reply_markup: keyboards.semesterList(semesters)
      });
    }
    await sessions.endSession(userId);
    return send(bot, chatId, '\u26A0\uFE0F \u062A\u0631\u0645 \u0641\u0639\u0627\u0644\u06CC \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  if (matchResult.type === 'partial') {
    // Single partial — ask for confirmation
    await sessions.updateSession(userId, SESSION_STATE.AWAITING_INSTRUCTOR, {
      course_id: data.course_id,
      course_name: data.course_name,
      confirmed_instructor: matchResult.name,
      flow: data.flow || 'search'
    });
    var confirmKB = keyboards.confirmationButtons(
      CB.INSTRUCTOR_SELECT + ':' + data.course_id + ':' + matching.normalizeInstructor(matchResult.name),
      CB.CANCEL + ':0'
    );
    return send(bot, chatId, messages.instructorConfirm(matchResult.name), {
      reply_markup: confirmKB
    });
  }

  if (matchResult.type === 'ambiguous') {
    // Multiple partial — show candidates
    await sessions.updateSession(userId, SESSION_STATE.AWAITING_INSTRUCTOR, {
      course_id: data.course_id,
      course_name: data.course_name,
      flow: data.flow || 'search'
    });
    return send(bot, chatId, messages.instructorAmbiguous(matchResult.names), {
      reply_markup: keyboards.cancelButton()
    });
  }

  // No match — allow as new instructor
  await sessions.updateSession(userId, SESSION_STATE.AWAITING_INSTRUCTOR, {
    course_id: data.course_id,
    course_name: data.course_name,
    new_instructor_name: text,
    flow: data.flow || 'search'
  });
  var newConfirmKB = keyboards.confirmationButtons(
    CB.INSTRUCTOR_SELECT + ':' + data.course_id + ':new',
    CB.CANCEL + ':0'
  );
  return send(bot, chatId, messages.instructorNew(text) + '\n\n\u0622\u06CC\u0627 \u0628\u0627 \u0627\u06CC\u0646 \u0646\u0627\u0645 \u0627\u0633\u062A\u0627\u062F \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u06CC\u0645\u061F', {
    reply_markup: newConfirmKB
  });
}

// ---------------------------------------------------------------------------
// AWAITING_LINK — user types a URL
// ---------------------------------------------------------------------------
async function handleAwaitingLink(bot, chatId, userId, text, data, user) {
  console.log('[link submit]', {
    chatId,
    userId,
    text
  });
  console.log(validation.validateUrl(text));

  var urlResult = validation.validateUrl(text);
  if (!urlResult.ok) {
    return send(bot, chatId, '\u274C ' + urlResult.error, {
      reply_markup: keyboards.cancelButton()
    });
  }
  console.log('[link validation]', urlResult);

  var url = urlResult.value;
  console.log('[url]', url);
  var canonicalUrl = matching.normalizeUrl(url);
  console.log('[canonical]', canonicalUrl);

  // Check duplicates
  var existingSubmission = await db.getSubmissionByCanonicalUrl(canonicalUrl);
  console.log('[existingSubmission]', existingSubmission);
  if (existingSubmission) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.submissionAlreadyExists(), {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }
  var existingLink = await db.getGroupLinkByCanonicalUrl(canonicalUrl);
  console.log('[existingLink]', existingLink);

  console.log('[session data]', data);

  console.log('[before session check]', {
    courseId: data.course_id,
    courseName: data.course_name,
    instructorName: data.instructor_name,
    semesterId: data.semester_id,
    semesterCode: data.semester_code
  });

  if (existingLink) {
    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0642\u0628\u0644\u0627\u064B \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Gather from session
  var courseId = data.course_id;
  var courseName = data.course_name;
  var instructorName = data.instructor_name;
  var instructorNormalized = data.instructor_normalized;
  var semesterId = data.semester_id;
  var semesterCode = data.semester_code;

  if (!courseId || !instructorName || !semesterId) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  // ADMIN and COADMIN may register a validated link directly.
  if (auth.isAdmin(user) || auth.isCoadmin(user)) {
    if (await db.getGroupLinkByCanonicalUrl(canonicalUrl)) {
      await sessions.endSession(userId);
      return send(bot, chatId, messages.submissionAlreadyExists(), {
        reply_markup: keyboards.mainMenu(auth.isAdmin(user))
      });
    }
    var directSubmission = await db.createSubmission(
      url, canonicalUrl, courseId, courseName, instructorName,
      instructorNormalized, semesterId, semesterCode, userId
    );
    try {
      await db.createGroupLink(
        url, canonicalUrl, courseId, instructorName, instructorNormalized,
        semesterId, userId, userId
      );
    } catch (err) {
      if (!(err && /unique|constraint/i.test(String(err.message || err)))) throw err;
      await sessions.endSession(userId);
      return send(bot, chatId, messages.submissionAlreadyExists(), {
        reply_markup: keyboards.mainMenu(auth.isAdmin(user))
      });
    }
    await db.updateSubmissionStatus(
      directSubmission.id, 'approved',
      'تأیید مستقیم توسط ' + (auth.isAdmin(user) ? 'مدیر' : 'ناظر'),
      userId
    );
    await db.audit(
      userId, user.role, 'direct_register_link', 'submission',
      directSubmission.id, '', url
    );
    await sessions.endSession(userId);
    return send(bot, chatId, '✅ لینک با موفقیت ثبت و تأیید شد!\n\n' + formatSubmissionInfo(data), {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  console.log('[before createSubmission]');
  // Regular user → pending submission
  var submission = await db.createSubmission(url, canonicalUrl, courseId, courseName, instructorName, instructorNormalized, semesterId, semesterCode, userId);
  console.log('[submission created]', submission);
  await db.audit(userId, ROLES.USER, 'submit_link', 'submission', submission.id, '', url);

  // Notify supervisors
  var supervisorsGroupId = await db.getSetting('supervisors_group_id');
  if (supervisorsGroupId) {
    try {
      var sent = await bot.sendMessage(parseInt(supervisorsGroupId, 10), messages.moderationMessage(submission), {
        parse_mode: 'HTML',
        reply_markup: keyboards.moderationActions(submission.id)
      });
      if (sent && sent.message_id) {
        await db.updateSubmissionMessageId(submission.id, sent.message_id);
      }
    } catch (e) {
      console.error('Failed to notify supervisors group:', e);
    }
  }

  await sessions.endSession(userId);
  return send(bot, chatId, messages.submissionCreated(submission), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// AWAITING_SUGGESTION_NAME — user suggests a new course
// ---------------------------------------------------------------------------
async function handleAwaitingSuggestionName(bot, chatId, userId, text, data, user) {
  if (text.length < 2) {
    return send(bot, chatId, '\u26A0\uFE0F \u0644\u0637\u0641\u0627\u064B \u062D\u062F\u0627\u0642\u0644 ۲ \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var nameResult = validation.validateCourseName(text);
  if (!nameResult.ok) {
    return send(bot, chatId, '\u274C ' + nameResult.error, {
      reply_markup: keyboards.cancelButton()
    });
  }

  var courseName = nameResult.value;
  var normalizedName = matching.normalizeText(courseName);

  // Exact match → course already exists
  var existingExact = await db.getCourseByNormalized(normalizedName);
  if (existingExact) {
    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u062F\u0633 \u00AB' + existingExact.name + '\u00BB \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A.\n\n\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0622\u0646 \u0631\u0627 \u0627\u0632 \u0645\u0646\u0648\u06CC \u062C\u0633\u062A\u062C\u0648 \u067E\u06CC\u062F\u0627 \u06A9\u0646\u06CC\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Suspiciously similar → ask confirmation
  var existingCourses = await db.getAllCourses();
  var suspicious = matching.findSuspiciousCourses(normalizedName, existingCourses);

  if (suspicious.length > 0 && !data.suspicious_confirmed) {
    await sessions.updateSession(userId, SESSION_STATE.AWAITING_SUGGESTION_NAME, {
      suggestion_name: courseName,
      suspicious_confirmed: true
    });
    return send(bot, chatId, messages.suggestionSuspicious(courseName, suspicious[0].course.name), {
      reply_markup: keyboards.confirmationButtons(
        CB.SUGGEST_COURSE + ':confirm:' + normalizedName,
        CB.CANCEL + ':0'
      )
    });
  }

  // Create suggestion
  var suggestion = await db.createCourseSuggestion(courseName, normalizedName, userId);
  await db.audit(userId, ROLES.USER, 'suggest_course', 'course_suggestion', suggestion.id, '', courseName);

  // Notify supervisors
  var supervisorsGroupId = await db.getSetting('supervisors_group_id');
  if (supervisorsGroupId) {
    var sugMsg = '\uD83D\uDCA1 <b>\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u062F\u0633 \u062C\u062F\u06CC\u062F</b>\n\n' +
      '\uD83D\uDC64 \u062A\u0648\u0633\u0637: ' + (user.first_name || '') + ' (' + userId + ')\n' +
      '\uD83D\uDCDA \u0646\u0627\u0645 \u062F\u0633: ' + courseName + '\n' +
      '\uD83D\uDCC5 \u062A\u0627\u0631\u06CC\u062E: ' + new Date().toISOString();
    try {
      await bot.sendMessage(parseInt(supervisorsGroupId, 10), sugMsg, {
        parse_mode: 'HTML',
        reply_markup: keyboards.suggestionActions(suggestion.id)
      });
    } catch (e) {
      console.error('Failed to notify supervisors about suggestion:', e);
    }
  }

  await sessions.endSession(userId);
  return send(bot, chatId, messages.suggestionCreated(courseName), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// AWAITING_REPLY_MESSAGE — moderator writes a reply to a user
// ---------------------------------------------------------------------------
async function handleAwaitingReplyMessage(bot, chatId, userId, text, data, user) {
  var submissionId = data.submission_id;
  if (!submissionId) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  var submission = await db.getSubmission(submissionId);
  if (!submission) {
    await sessions.endSession(userId);
    return send(bot, chatId, '\u274C \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Send reply to submitter
  try {
    await bot.sendMessage(submission.submitted_by, messages.replyMessage(text), { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Failed to send reply to submitter:', e);
  }

  await db.audit(userId, user.role, 'reply_submission', 'submission', submissionId, '', text);
  await sessions.endSession(userId);
  return send(bot, chatId, '\u2705 \u067E\u06CC\u0627\u0645 \u0634\u0645\u0627 \u0628\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A\u200C\u062F\u0647\u0646\u062F\u0647 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F.', {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// AWAITING_EDIT_LINK — user provides a new URL for a rejected submission
// ---------------------------------------------------------------------------
async function handleAwaitingEditLink(bot, chatId, userId, text, data, user) {
  var urlResult = validation.validateUrl(text);
  if (!urlResult.ok) {
    return send(bot, chatId, '\u274C ' + urlResult.error, {
      reply_markup: keyboards.cancelButton()
    });
  }

  var url = urlResult.value;
  var canonicalUrl = matching.normalizeUrl(url);
  var submissionId = data.submission_id;
  if (!submissionId) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  // Duplicate checks
  var existingSubmission = await db.getSubmissionByCanonicalUrl(canonicalUrl);
  if (existingSubmission && existingSubmission.id !== submissionId) {
    return send(bot, chatId, messages.submissionAlreadyExists(), {
      reply_markup: keyboards.cancelButton()
    });
  }
  var existingLink = await db.getGroupLinkByCanonicalUrl(canonicalUrl);
  if (existingLink) {
    return send(bot, chatId, '\u2705 \u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0642\u0628\u0644\u0627\u064B \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var submission = await db.getSubmission(submissionId);
  if (!submission) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  // Admin → direct approve
  if (auth.isAdmin(user)) {
    await db.createGroupLink(url, canonicalUrl, submission.course_id, submission.instructor_name, submission.instructor_name_normalized, submission.semester_id, userId, userId);
    await db.updateSubmissionStatus(submissionId, 'approved', '\u062A\u0623\u06CC\u06CC\u062F \u062E\u0648\u062F\u06A9\u0627\u0631 (\u0648\u06CC\u0631\u0627\u06CC\u0634)', userId);
    await db.audit(userId, ROLES.ADMIN, 'approve_edited_link', 'submission', submissionId, submission.url, url);
    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u0644\u06CC\u0646\u06A9 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F\u0647 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062B\u0628\u062A \u0648 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F!\n\n\uD83D\uDD17 \u0644\u06CC\u0646\u06A9 \u062C\u062F\u06CC\u062F: ' + url, {
      reply_markup: keyboards.mainMenu(true)
    });
  }

  // Regular user → reset to pending
  await db.updateSubmissionStatus(submissionId, 'pending', '\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F\u0647 \u062A\u0648\u0633\u0637 \u06A9\u0627\u0631\u0628\u0631', userId);
  await db.audit(userId, ROLES.USER, 'edit_link', 'submission', submissionId, submission.url, url);

  // Notify supervisors
  var supervisorsGroupId = await db.getSetting('supervisors_group_id');
  if (supervisorsGroupId) {
    var modSub = await db.getSubmission(submissionId);
    if (modSub) {
      var editMsg = '\u270F\uFE0F <b>\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0644\u06CC\u0646\u06A9</b>\n\n' +
        '\uD83D\uDC64 \u062A\u0648\u0633\u0637: ' + (user.first_name || '') + ' (' + userId + ')\n' +
        '\uD83D\uDCDA \u062F\u0633: ' + modSub.course_name + '\n' +
        '\uD83D\uDC68\u200D\uD83C\uDFEB \u0627\u0633\u062A\u0627\u062F: ' + modSub.instructor_name + '\n' +
        '\uD83D\uDCC5 \u062A\u0631\u0645: ' + modSub.semester_code + '\n' +
        '\uD83D\uDD17 \u0644\u06CC\u0646\u06A9 \u062C\u062F\u06CC\u062F: <a href="' + messages.escapeHtml(url) + '">' + messages.escapeHtml(url) + '</a>';
      try {
        var sent = await bot.sendMessage(parseInt(supervisorsGroupId, 10), editMsg, {
          parse_mode: 'HTML',
          reply_markup: keyboards.moderationActions(submissionId)
        });
        if (sent && sent.message_id) {
          await db.updateSubmissionMessageId(submissionId, sent.message_id);
        }
      } catch (e) {
        console.error('Failed to notify supervisors about edit:', e);
      }
    }
  }

  await sessions.endSession(userId);
  return send(bot, chatId, '\u2705 \u0644\u06CC\u0646\u06A9 \u0634\u0645\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F \u0648 \u0628\u0631\u0627\u06CC \u0628\u0631\u0631\u0633\u06CC \u0645\u062C\u062F\u062F \u0628\u0647 \u0646\u0627\u0638\u0631\u0627\u0646 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F.\n\n\uD83D\uDD17 \u0644\u06CC\u0646\u06A9 \u062C\u062F\u06CC\u062F: ' + url, {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// AWAITING_ADMIN_COURSE_NAME — admin creates course directly
// ---------------------------------------------------------------------------
async function handleAwaitingAdminCourseName(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var nameResult = validation.validateCourseName(text);
  if (!nameResult.ok) {
    return send(bot, chatId, '\u274C ' + nameResult.error, { reply_markup: keyboards.cancelButton() });
  }

  var courseName = nameResult.value;
  var normalizedName = matching.normalizeText(courseName);

  var existing = await db.getCourseByNormalized(normalizedName);
  if (existing) {
    return send(bot, chatId, '\u26A0\uFE0F \u062F\u0633 \u00AB' + existing.name + '\u00BB \u0628\u0627 \u0627\u06CC\u0646 \u0646\u0627\u0645 \u062F\u0631 \u0633\u06CC\u0633\u062A\u0645 \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var course = await db.createCourse(courseName, normalizedName);
  await db.audit(userId, ROLES.ADMIN, 'create_course', 'course', course.id, '', courseName);
  await sessions.endSession(userId);
  return send(bot, chatId, '\u2705 \u062F\u0633 \u00AB' + course.name + '\u00BB \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.', {
    reply_markup: keyboards.adminPanel()
  });
}

// ---------------------------------------------------------------------------
// AWAITING_ADMIN_SEMESTER_NAME — admin creates semester (step 1: name)
// ---------------------------------------------------------------------------
async function handleAwaitingAdminSemesterName(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var nameResult = validation.validateSemesterName(text);
  if (!nameResult.ok) {
    return send(bot, chatId, '\u274C ' + nameResult.error, { reply_markup: keyboards.cancelButton() });
  }

  await sessions.updateSession(userId, SESSION_STATE.AWAITING_ADMIN_SEMESTER_CODE, {
    semester_name: nameResult.value
  });
  return send(bot, chatId, '\uD83D\uDCC5 \u06A9\u062F \u062A\u0631\u0645 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F (۵ \u0631\u0642\u0645\u06CC\u060C \u0645\u062B\u0627\u0644: ۱۴۰۵۲):\n\n\u274C \u0644\u063A\u0648: /cancel', {
    reply_markup: keyboards.cancelButton()
  });
}

// ---------------------------------------------------------------------------
// AWAITING_ADMIN_SEMESTER_CODE — admin creates semester (step 2: code)
// ---------------------------------------------------------------------------
async function handleAwaitingAdminSemesterCode(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var codeResult = validation.validateSemesterCode(text);
  if (!codeResult.ok) {
    return send(bot, chatId, '\u274C ' + codeResult.error, { reply_markup: keyboards.cancelButton() });
  }

  var semesterCode = codeResult.value;
  var semesterName = data.semester_name;
  if (!semesterName) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  var existing = await db.getSemesterByCode(semesterCode);
  if (existing) {
    return send(bot, chatId, '\u26A0\uFE0F \u062A\u0631\u0645 \u0628\u0627 \u06A9\u062F \u00AB' + semesterCode + '\u00BB \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.\n\n\u0646\u0627\u0645 \u062A\u0631\u0645: ' + existing.name, {
      reply_markup: keyboards.cancelButton()
    });
  }

  var semester = await db.createSemester(semesterName, semesterCode);
  await db.audit(userId, ROLES.ADMIN, 'create_semester', 'semester', semester.id, '', semesterName + ' (' + semesterCode + ')');
  await sessions.endSession(userId);
  return send(bot, chatId, '\u2705 \u062A\u0631\u0645 \u00AB' + semester.name + '\u00BB (\u06A9\u062F: ' + semester.code + ') \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.', {
    reply_markup: keyboards.adminPanel()
  });
}

// ---------------------------------------------------------------------------
// AWAITING_ADMIN_ROLE_TARGET — admin enters a Telegram ID
// ---------------------------------------------------------------------------
async function handleAwaitingAdminRoleTarget(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var idResult = validation.validateTelegramId(text);
  if (!idResult.ok) {
    return send(bot, chatId, '\u274C ' + idResult.error, { reply_markup: keyboards.cancelButton() });
  }

  var targetId = idResult.value;
  var targetUser = await db.getUser(targetId);
  if (!targetUser) {
    return send(bot, chatId, '\u274C \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0634\u0646\u0627\u0633\u0647 ' + targetId + ' \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  if (targetId === userId) {
    return send(bot, chatId, '\u26A0\uFE0F \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0646\u0642\u0634 \u062E\u0648\u062F\u062A\u0627\u0646 \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0647\u06CC\u062F.', {
      reply_markup: keyboards.cancelButton()
    });
  }

  var targetName = (targetUser.first_name || String(targetId)).trim();
  await sessions.updateSession(userId, SESSION_STATE.AWAITING_ADMIN_ROLE_NEW, {
    target_id: targetId,
    target_name: targetName,
    current_role: targetUser.role
  });
  return send(bot, chatId, '\uD83D\uDC64 \u06A9\u0627\u0631\u0628\u0631: <b>' + targetName + '</b>\n\uD83D\uDCCB \u0646\u0642\u0634 \u0641\u0639\u0644\u06CC: ' + targetUser.role + '\n\n\u0646\u0642\u0634 \u062C\u062F\u06CC\u062F \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F:', {
    reply_markup: keyboards.roleChangeButtons(targetId)
  });
}

// ---------------------------------------------------------------------------
// AWAITING_ADMIN_ROLE_NEW — admin enters the new role (text or button)
// ---------------------------------------------------------------------------
async function handleAwaitingAdminRoleNew(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var targetId = data.target_id;
  if (!targetId) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  var roleResult = validation.validateRole(text);
  if (!roleResult.ok) {
    return send(bot, chatId, '\u274C ' + roleResult.error + '\n\n\u0646\u0642\u0634\u200C\u0647\u0627\u06CC \u0645\u0639\u062A\u0628\u0631: user, coadmin, admin', {
      reply_markup: keyboards.roleChangeButtons(targetId)
    });
  }

  var newRole = roleResult.value;
  var targetUser = await db.getUser(targetId);
  if (!targetUser) {
    await sessions.endSession(userId);
    return send(bot, chatId, '\u274C \u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
      reply_markup: keyboards.adminPanel()
    });
  }

  var oldRole = targetUser.role;
  await db.setRole(targetId, newRole);
  await db.audit(userId, ROLES.ADMIN, 'change_role', 'user', targetId, oldRole, newRole);
  await sessions.endSession(userId);
  return send(bot, chatId, messages.roleChanged(targetId, oldRole, newRole), {
    reply_markup: keyboards.adminPanel()
  });
}

// ---------------------------------------------------------------------------
// AWAITING_SETTINGS_VALUE — admin sets a bot setting
// ---------------------------------------------------------------------------
async function handleAwaitingSettingsValue(bot, chatId, userId, text, data, user) {
  if (!auth.isAdmin(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var settingKey = data.setting_key;
  if (!settingKey) {
    await sessions.endSession(userId);
    return sendError(bot, chatId);
  }

  var valResult = validation.validateSettingsValue(text);
  if (!valResult.ok) {
    return send(bot, chatId, '\u274C ' + valResult.error, { reply_markup: keyboards.cancelButton() });
  }

  var value = valResult.value;
  await db.setSetting(settingKey, value);
  await db.audit(userId, ROLES.ADMIN, 'update_setting', 'bot_settings', 0, settingKey, value);
  await sessions.endSession(userId);
  return send(bot, chatId, messages.settingsUpdated(settingKey, value), {
    reply_markup: keyboards.adminPanel()
  });
}

// ---------------------------------------------------------------------------
// AWAITING_REJECTION_REASON — moderator writes rejection reason
// Handles submission_id, course_change_request_id, suggestion_id
// ---------------------------------------------------------------------------
async function handleAwaitingRejectionReason(bot, chatId, userId, text, data, user) {
  var reason = text;

  // Submission rejection
  if (data.submission_id) {
    var submission = await db.getSubmission(data.submission_id);
    if (!submission) {
      await sessions.endSession(userId);
      return send(bot, chatId, '\u274C \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
        reply_markup: keyboards.mainMenu(auth.isAdmin(user))
      });
    }

    await db.updateSubmissionStatus(data.submission_id, 'rejected', reason, userId);
    await db.audit(userId, user.role, 'reject_submission', 'submission', data.submission_id, '', reason);

    try {
      await bot.sendMessage(submission.submitted_by, messages.submissionRejected(submission, reason), { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to notify submitter about rejection:', e);
    }

    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0631\u062F \u0634\u062F \u0648 \u0628\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0627\u0637\u0644\u0627\u0639 \u062F\u0627\u062F\u0647 \u0634\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Course change request rejection
  if (data.course_change_request_id) {
    var req = await db.getCourseChangeRequest(data.course_change_request_id);
    if (!req) {
      await sessions.endSession(userId);
      return send(bot, chatId, '\u274C \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
        reply_markup: keyboards.mainMenu(auth.isAdmin(user))
      });
    }

    await db.updateCourseChangeRequestStatus(data.course_change_request_id, 'rejected', reason, userId);
    await db.audit(userId, user.role, 'reject_course_change', 'course_change_request', data.course_change_request_id, '', reason);

    try {
      await bot.sendMessage(req.requested_by, '\u274C \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633 \u0634\u0645\u0627 \u0631\u062F \u0634\u062F.\n\n\u0646\u0648\u0639: ' + req.request_type + '\n\u06F9\u067D\u06CC\u0644: ' + (req.proposed_name || '') + '\n\u062F\u0644\u06CC\u0644 \u0631\u062F: ' + reason, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to notify requester about rejection:', e);
    }

    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633 \u0631\u062F \u0634\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Suggestion rejection
  if (data.suggestion_id) {
    var suggestion = await db.getCourseSuggestion(data.suggestion_id);
    if (!suggestion) {
      await sessions.endSession(userId);
      return send(bot, chatId, '\u274C \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.', {
        reply_markup: keyboards.mainMenu(auth.isAdmin(user))
      });
    }

    await db.updateCourseSuggestionStatus(data.suggestion_id, 'rejected', reason, userId, userId);
    await db.audit(userId, user.role, 'reject_suggestion', 'course_suggestion', data.suggestion_id, '', reason);

    try {
      await bot.sendMessage(suggestion.suggested_by, '\u274C \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0634\u0645\u0627 \u0628\u0631\u0627\u06CC \u062F\u0633 \u00AB' + suggestion.course_name + '\u00BB \u0631\u062F \u0634\u062F.\n\n\u062F\u0644\u06CC\u0644 \u0631\u062F: ' + reason, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to notify suggester about rejection:', e);
    }

    await sessions.endSession(userId);
    return send(bot, chatId, '\u2705 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0631\u062F \u0634\u062F.', {
      reply_markup: keyboards.mainMenu(auth.isAdmin(user))
    });
  }

  // Unknown — clean up
  await sessions.endSession(userId);
  return sendError(bot, chatId);
}

// ---------------------------------------------------------------------------
// AWAITING_COURSE_CHANGE_NAME — admin/supervisor provides new course name
// ---------------------------------------------------------------------------
async function handleAwaitingCourseChangeName(bot, chatId, userId, text, data, user) {
  if (!auth.canModerate(user)) {
    await sessions.endSession(userId);
    return send(bot, chatId, messages.unauthorized(), { reply_markup: keyboards.mainMenu(false) });
  }

  var nameResult = validation.validateCourseName(text);
  if (!nameResult.ok) {
    return send(bot, chatId, '\u274C ' + nameResult.error, { reply_markup: keyboards.cancelButton() });
  }

  var proposedName = nameResult.value;
  var proposedNormalized = matching.normalizeText(proposedName);
  var courseId = data.course_id || 0;
  var courseName = data.course_name || '';

  var request = await db.createCourseChangeRequest(
    data.request_type || 'rename', courseId, courseName, proposedName, proposedNormalized, userId
  );
  await db.audit(userId, user.role, 'create_course_change_request', 'course_change_request', request.id, '', proposedName);

  // Notify admin group
  var adminGroupId = await db.getSetting('admin_only_group_id');
  if (adminGroupId) {
    var reqMsg = '\uD83D\uDCCB <b>\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0633</b>\n\n' +
      '\uD83D\uDC64 \u062A\u0648\u0633\u0637: ' + (user.first_name || '') + ' (' + userId + ')\n' +
      '\uD83D\uDCCB \u0646\u0648\u0639: ' + (request.request_type || 'rename') + '\n' +
      '\uD83D\uDCDA \u062F\u0633 \u062D\u0627\u0644\u06CC: ' + (courseName || '(\u062C\u062F\u06CC\u062F)') + '\n' +
      '\uD83D\uDCDD \u0646\u0627\u0645 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC: ' + proposedName;
    try {
      await bot.sendMessage(parseInt(adminGroupId, 10), reqMsg, {
        parse_mode: 'HTML',
        reply_markup: keyboards.courseChangeActions(request.id)
      });
    } catch (e) {
      console.error('Failed to notify admins about course change request:', e);
    }
  }

  await sessions.endSession(userId);
  return send(bot, chatId, messages.courseChangeRequestCreated(request), {
    reply_markup: keyboards.mainMenu(auth.isAdmin(user))
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default async function (message) {
  if (!message || !message.from || !message.from.id) return;
  const user = await ensureUser(message.from);
  try {
    return await handleMessage(message, user, bot);
  } catch (err) {
    console.error('[message] handler error:', err);
    try {
      if (message.chat && message.chat.id) {
        await bot.sendMessage(message.chat.id, messages.error(), { parse_mode: 'HTML' });
      }
    } catch (_) {}
  }
}
