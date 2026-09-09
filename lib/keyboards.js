// lib/keyboards.js — Inline keyboard builders

import { CB } from './config.js';

function cb(action) {
  // Truncate to limit (Telegram callback data max is 64 bytes)
  if (action.length > 64) action = action.substring(0, 64);
  return action;
}

function mainMenu(isAdmin) {
  var buttons = [
    [{ text: '🔍 جستجوی گروه درس', callback_data: cb(CB.SEARCH_COURSE + ':0') }],
    [{ text: '➕ ثبت لینک گروه', callback_data: cb(CB.SUBMIT_LINK + ':0') }],
    [{ text: '💡 پیشنهاد درس', callback_data: cb(CB.SUGGEST_COURSE + ':0') }],
    [{ text: '❓ راهنما', callback_data: cb(CB.HELP + ':0') }]
  ];
  if (isAdmin) {
    buttons.push([{ text: '⚙️ پنل مدیریت', callback_data: cb(CB.ADMIN + ':0') }]);
  }
  return { inline_keyboard: buttons };
}

function backButton(target) {
  return { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: cb(target) }]] };
}

function cancelButton(target) {
  return { inline_keyboard: [[{ text: '❌ لغو', callback_data: cb(target || (CB.CANCEL + ':0')) }]] };
}

function courseList(courses, prefix) {
  prefix = prefix || CB.COURSE_SELECT;
  var buttons = [];
  for (var i = 0; i < courses.length; i++) {
    buttons.push([{ text: courses[i].name, callback_data: cb(prefix + ':' + courses[i].id) }]);
  }
  buttons.push([{ text: '🔙 بازگشت', callback_data: cb(CB.MENU + ':0') }]);
  return { inline_keyboard: buttons };
}

function instructorList(instructors, courseId) {
  var buttons = [];
  for (var i = 0; i < instructors.length; i++) {
    buttons.push([{ text: instructors[i].instructor_name, callback_data: cb(CB.INSTRUCTOR_SELECT + ':' + courseId + ':' + instructors[i].instructor_name_normalized) }]);
  }
  buttons.push([{ text: '🔙 بازگشت', callback_data: cb(CB.SEARCH_COURSE + ':0') }]);
  return { inline_keyboard: buttons };
}

function semesterList(semesters, prefix) {
  prefix = prefix || CB.SEMESTER_SELECT;
  var buttons = [];
  for (var i = 0; i < semesters.length; i++) {
    buttons.push([{ text: semesters[i].name + ' (' + semesters[i].code + ')', callback_data: cb(prefix + ':' + semesters[i].id) }]);
  }
  buttons.push([{ text: '❌ لغو', callback_data: cb(CB.CANCEL + ':0') }]);
  return { inline_keyboard: buttons };
}

function moderationActions(submissionId) {
  return {
    inline_keyboard: [
      [{ text: '✅ تأیید', callback_data: cb(CB.APPROVE + ':sub:' + submissionId) },
       { text: '❌ رد', callback_data: cb(CB.REJECT + ':sub:' + submissionId) }],
      [{ text: '💬 پاسخ', callback_data: cb(CB.REPLY + ':sub:' + submissionId) }]
    ]
  };
}

function courseChangeActions(requestId) {
  return {
    inline_keyboard: [
      [{ text: '✅ تأیید', callback_data: cb(CB.APPROVE + ':ccr:' + requestId) },
       { text: '❌ رد', callback_data: cb(CB.REJECT + ':ccr:' + requestId) }]
    ]
  };
}

function confirmationButtons(confirmAction, cancelTarget) {
  return {
    inline_keyboard: [
      [{ text: '✅ بله', callback_data: cb(confirmAction) },
       { text: '❌ خیر', callback_data: cb(cancelTarget || (CB.CANCEL + ':0')) }]
    ]
  };
}

function yesNoButtons(yesAction, noAction) {
  return {
    inline_keyboard: [
      [{ text: 'بله', callback_data: cb(yesAction) },
       { text: 'خیر', callback_data: cb(noAction) }]
    ]
  };
}

function adminPanel() {
  return {
    inline_keyboard: [
      [{ text: '👤 مدیریت کاربران', callback_data: cb(CB.ADMIN + ':users') }],
      [{ text: '📚 مدیریت دروس', callback_data: cb(CB.ADMIN + ':courses') }],
      [{ text: '📅 مدیریت ترم‌ها', callback_data: cb(CB.ADMIN + ':semesters') }],
      [{ text: '🔗 گروه ناظران', callback_data: cb(CB.ADMIN + ':supervisors') }],
      [{ text: '🔒 گروه مدیران', callback_data: cb(CB.ADMIN + ':admins') }],
      [{ text: '📋 درخواست‌های تغییر درس', callback_data: cb(CB.ADMIN + ':requests') }],
      [{ text: '💡 پیشنهادات درس', callback_data: cb(CB.ADMIN + ':suggestions') }],
      [{ text: '📊 آمار و گزارش', callback_data: cb(CB.ADMIN + ':stats') }],
      [{ text: '🔙 منوی اصلی', callback_data: cb(CB.MENU + ':0') }]
    ]
  };
}

function adminUserList(users) {
  var buttons = [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var name = (u.first_name || '') + ' ' + (u.last_name || '');
    name = name.trim() || String(u.telegram_id);
    buttons.push([{ text: name + ' (' + u.role + ')', callback_data: cb(CB.ADMIN + ':ur:' + u.telegram_id) }]);
  }
  buttons.push([{ text: '🔙 بازگشت', callback_data: cb(CB.ADMIN + ':0') }]);
  return { inline_keyboard: buttons };
}

function adminCourseList(courses) {
  var buttons = [];
  for (var i = 0; i < courses.length; i++) {
    buttons.push([{ text: courses[i].name, callback_data: cb(CB.ADMIN + ':cr:' + courses[i].id) }]);
  }
  buttons.push([{ text: '➕ درس جدید', callback_data: cb(CB.ADMIN + ':cadd') }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: cb(CB.ADMIN + ':0') }]);
  return { inline_keyboard: buttons };
}

function adminSemesterList(semesters) {
  var buttons = [];
  for (var i = 0; i < semesters.length; i++) {
    var s = semesters[i];
    var status = s.active ? '🟢' : '🔴';
    buttons.push([{ text: status + ' ' + s.name + ' (' + s.code + ')', callback_data: cb(CB.ADMIN + ':sr:' + s.id) }]);
  }
  buttons.push([{ text: '➕ ترم جدید', callback_data: cb(CB.ADMIN + ':sadd') }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: cb(CB.ADMIN + ':0') }]);
  return { inline_keyboard: buttons };
}

function roleChangeButtons(targetId) {
  return {
    inline_keyboard: [
      [{ text: '👤 user', callback_data: cb(CB.ADMIN + ':role:' + targetId + ':user') }],
      [{ text: '🛡️ coadmin', callback_data: cb(CB.ADMIN + ':role:' + targetId + ':coadmin') }],
      [{ text: '👑 admin', callback_data: cb(CB.ADMIN + ':role:' + targetId + ':admin') }],
      [{ text: '🔙 بازگشت', callback_data: cb(CB.ADMIN + ':users') }]
    ]
  };
}

function suggestionActions(suggestionId) {
  return {
    inline_keyboard: [
      [{ text: '✅ تأیید', callback_data: cb(CB.SUGGESTION + ':ap:' + suggestionId) },
       { text: '❌ رد', callback_data: cb(CB.SUGGESTION + ':rj:' + suggestionId) }]
    ]
  };
}

function semesterDeleteConfirm(semesterId) {
  return confirmationButtons(
    cb(CB.CONFIRM_DELETE + ':' + semesterId),
    cb(CB.ADMIN + ':semesters')
  );
}

function suggestionConfirmButtons(normalizedName, courseId) {
  var yesAction = cb(CB.SUGGEST_COURSE + ':confirm:' + normalizedName);
  var noAction = cb(CB.SEARCH_COURSE + ':0');
  return yesNoButtons(yesAction, noAction);
}


export { mainMenu, backButton, cancelButton, courseList, instructorList, semesterList, moderationActions, courseChangeActions, confirmationButtons, yesNoButtons, adminPanel, adminUserList, adminCourseList, adminSemesterList, roleChangeButtons, suggestionActions, semesterDeleteConfirm, suggestionConfirmButtons, cb };
