// lib/messages.js — Message text builders (Persian)

function welcome(user) {
  var name = user.first_name || 'کاربر';
  return 'سلام ' + name + '! 👋\n\n' +
    'به ربات گروه‌های درسی دانشگاه آزاد خوش آمدید.\n\n' +
    'از منوی زیر گزینه مورد نظر خود را انتخاب کنید:';
}

function help() {
  return '📚 راهنمای ربات\n\n' +
    '🔍 <b>جستجوی گروه درس</b>\n' +
    'نام درس را جستجو کنید و لینک گروه‌های مرتبط را ببینید.\n\n' +
    '➕ <b>ثبت لینک گروه</b>\n' +
    'اگر لینک گروهی دارید که در سیستم نیست، آن را ثبت کنید.\n\n' +
    '💡 <b>پیشنهاد درس</b>\n' +
    'اگر درسی در سیستم نیست، آن را پیشنهاد دهید.\n\n' +
    '💡 درخواست‌های شما پس از بررسی توسط ناظران و مدیران تأیید می‌شود.';
}

function courseSearchPrompt() {
  return '🔍 نام درس را وارد کنید:\n\n' +
    '💡 مثال: ریاضی ۱، آمار و احتمالات\n\n' +
    'برای لغو روی دکمه ❌ لغو کلیک کنید.';
}

function courseNotFound(name) {
  return '❌ درس «' + name + '» یافت نشد.\n\n' +
    'آیا می‌خواهید این درس را پیشنهاد دهید؟';
}

function courseFound(course) {
  return '✅ درس پیدا شد: \n\n' +
    '📚 <b>' + course.name + '</b>';
}

function instructorPrompt() {
  return '👨‍🏫 نام استاد را وارد کنید:\n\n' +
    '💡 مثال: دکتر علی جماعت\n\n' +
    'برای لغو روی ❌ لغو کلیک کنید.';
}

function instructorAmbiguous(names) {
  var text = '❓ چند استاد با این نام پیدا شد:\n\n';
  for (var i = 0; i < names.length; i++) {
    text += (i + 1) + '. ' + names[i] + '\n';
  }
  text += '\nلطفاً نام کامل استاد را وارد کنید.';
  return text;
}

function instructorConfirm(name) {
  return 'آیا منظور شما «' + name + '» است؟';
}

function instructorNew(name) {
  return '📝 استاد «' + name + '» در سیستم موجود نیست.\n' +
    'با ثبت لینک، این نام به عنوان استاد جدید ذخیره می‌شود.';
}

function semesterPrompt() {
  return '📅 ترم مورد نظر را انتخاب کنید:';
}

function linkPrompt() {
  return '🔗 لینک گروه را وارد کنید:\n\n' +
    '💡 لینک می‌تواند از هر پلتفرمی باشد (تلگرام، واتساپ، اینستاگرام و...)\n\n' +
    'برای لغو روی ❌ لغو کلیک کنید.';
}

function submissionCreated(sub) {
  return '✅ لینک شما با موفقیت ثبت شد!\n\n' +
    '📚 درس: ' + sub.course_name + '\n' +
    '👨‍🏫 استاد: ' + sub.instructor_name + '\n' +
    '📅 ترم: ' + sub.semester_code + '\n' +
    '🔗 لینک: ' + sub.url + '\n\n' +
    'درخواست شما برای بررسی به ناظران ارسال شد.\n' +
    'پس از تأیید، لینک قابل جستجو خواهد بود.';
}

function submissionAlreadyExists() {
  return '⚠️ این لینک قبلاً ثبت شده است.';
}

function suggestionPrompt() {
  return '💡 نام درس پیشنهادی را وارد کنید:\n\n' +
    'برای لغو روی ❌ لغو کلیک کنید.';
}

function suggestionCreated(name) {
  return '✅ درس «' + name + '» با موفقیت پیشنهاد شد.\n\n' +
    'پیشنهاد شما پس از بررسی توسط ناظران و مدیران به سیستم اضافه خواهد شد.';
}

function suggestionSuspicious(name, similarName) {
  return '⚠️ درس «' + name + '» شباهت زیادی به درس «' + similarName + '» دارد.\n\n' +
    'آیا مطمئن هستید که این درس جدیدی است؟';
}

// === Search results ===
function searchResults(course, groupsBySemester) {
  var text = '📚 <b>' + course.name + '</b>\n\n';
  var semesters = Object.keys(groupsBySemester);
  if (semesters.length === 0) {
    text += 'هیچ لینک تأیید شده‌ای برای این درس وجود ندارد.';
  }
  for (var i = 0; i < semesters.length; i++) {
    var groups = groupsBySemester[semesters[i]];
    text += '📅 ' + semesters[i] + '\n';
    for (var j = 0; j < groups.length; j++) {
      var g = groups[j];
      var platform = derivePlatform(g.url);
      text += '  🔗 <a href="' + escapeHtml(g.url) + '">' + platform + '</a>\n';
    }
    text += '\n';
  }
  return text;
}

function instructorSearchResults(course, instructor, groupsBySemester) {
  var text = '📚 <b>' + course.name + '</b>\n';
  text += '👨‍🏫 استاد: <b>' + instructor + '</b>\n\n';
  var semesters = Object.keys(groupsBySemester);
  for (var i = 0; i < semesters.length; i++) {
    var groups = groupsBySemester[semesters[i]];
    text += '📅 ' + semesters[i] + '\n';
    for (var j = 0; j < groups.length; j++) {
      var g = groups[j];
      var platform = derivePlatform(g.url);
      text += '  🔗 <a href="' + escapeHtml(g.url) + '">' + platform + '</a>\n';
    }
    text += '\n';
  }
  return text;
}

// === Moderation messages ===
function moderationMessage(sub) {
  return '📋 <b>درخواست ثبت لینک جدید</b>\n\n' +
    '👤 درخواست‌دهنده: ' + sub.submitted_by + '\n' +
    '📚 درس: ' + sub.course_name + '\n' +
    '👨‍🏫 استاد: ' + sub.instructor_name + '\n' +
    '📅 ترم: ' + sub.semester_code + '\n' +
    '🔗 لینک: <a href="' + escapeHtml(sub.url) + '">' + escapeHtml(sub.url) + '</a>\n' +
    '📅 تاریخ ثبت: ' + sub.created_at;
}

function moderationStatus(sub) {
  var statusText = {
    'pending': '⏳ در انتظار بررسی',
    'needs_user_edit': '✏️ نیاز به ویرایش',
    'approved': '✅ تأیید شده',
    'rejected': '❌ رد شده'
  };
  return statusText[sub.status] || sub.status;
}

function submissionApproved(sub) {
  return '✅ لینک شما تأیید شد!\n\n' +
    '📚 درس: ' + sub.course_name + '\n' +
    '👨‍🏫 استاد: ' + sub.instructor_name + '\n' +
    '📅 ترم: ' + sub.semester_code + '\n' +
    '🔗 لینک: ' + sub.url;
}

function submissionRejected(sub, reason) {
  return '❌ لینک شما رد شد.\n\n' +
    '📚 درس: ' + sub.course_name + '\n' +
    '👨‍🏫 استاد: ' + sub.instructor_name + '\n' +
    '📅 ترم: ' + sub.semester_code + '\n' +
    '🔗 لینک: ' + sub.url + '\n\n' +
    '📝 دلیل رد: ' + (reason || 'بدون دلیل') + '\n\n' +
    'می‌توانید لینک جدیدی ثبت کنید.';
}

function submissionNeedsEdit(sub) {
  return '✏️ ناظر درخواست ویرایش درخواست شما را دارد.\n\n' +
    '📚 درس: ' + sub.course_name + '\n' +
    '👨‍🏫 استاد: ' + sub.instructor_name + '\n' +
    '📅 ترم: ' + sub.semester_code + '\n' +
    '🔗 لینک: ' + sub.url + '\n\n' +
    'برای ویرایش، لینک جدید را ارسال کنید.';
}

function replyMessage(text) {
  return '💬 پاسخ ناظر:\n\n' + text;
}

// === Admin panel messages ===
function adminStats(stats) {
  return '📊 <b>آمار سیستم</b>\n\n' +
    '👤 کل کاربران: ' + (stats.users || 0) + '\n' +
    '📚 کل دروس: ' + (stats.courses || 0) + '\n' +
    '📅 کل ترم‌ها: ' + (stats.semesters || 0) + '\n' +
    '🔗 کل لینک‌ها: ' + (stats.groupLinks || 0) + '\n' +
    '⏳ درخواست‌های در انتظار: ' + (stats.pendingSubmissions || 0) + '\n' +
    '📋 درخواست‌های تغییر درس: ' + (stats.pendingCourseChanges || 0) + '\n' +
    '💡 پیشنهادات درس: ' + (stats.pendingSuggestions || 0);
}

function roleChanged(targetId, oldRole, newRole) {
  return '✅ نقش کاربر ' + targetId + ' از «' + oldRole + '» به «' + newRole + '» تغییر کرد.';
}

function settingsUpdated(key, value) {
  return '✅ تنظیم «' + key + '» به «' + value + '» به‌روزرسانی شد.';
}

function unauthorized() {
  return '🚫 شما دسترسی به این بخش ندارید.';
}

function error() {
  return '⚠️ خطایی رخ داد. لطفاً دوباره تلاش کنید.';
}

function cancelled() {
  return '❌ عملیات لغو شد.';
}

function courseChangeRequestCreated(req) {
  return '✅ درخواست تغییر درس ثبت شد:\n\n' +
    '📋 نوع: ' + req.request_type + '\n' +
    '📚 درس: ' + (req.course_name || '(جدید)') + '\n' +
    '📝 پیشنهاد: ' + req.proposed_name + '\n\n' +
    'درخواست شما برای بررسی به مدیران ارسال شد.';
}

// === Helpers ===
function derivePlatform(url) {
  if (!url) return 'لینک';
  var u = url.toLowerCase();
  if (u.indexOf('t.me') !== -1 || u.indexOf('telegram.me') !== -1) return 'تلگرام';
  if (u.indexOf('wa.me') !== -1 || u.indexOf('whatsapp') !== -1) return 'واتساپ';
  if (u.indexOf('instagram') !== -1) return 'اینستاگرام';
  if (u.indexOf('bale.ai') !== -1) return 'بله';
  if (u.indexOf('eitaa.com') !== -1) return 'ایتا';
  if (u.indexOf('rubika.ir') !== -1) return 'روبیکا';
  if (u.indexOf('soroush') !== -1) return 'سروش';
  if (u.indexOf('gap.im') !== -1) return 'گپ';
  return 'لینک';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


export { welcome, help, courseSearchPrompt, courseNotFound, courseFound, instructorPrompt, instructorAmbiguous, instructorConfirm, instructorNew, semesterPrompt, linkPrompt, submissionCreated, submissionAlreadyExists, suggestionPrompt, suggestionCreated, suggestionSuspicious, searchResults, instructorSearchResults, moderationMessage, moderationStatus, submissionApproved, submissionRejected, submissionNeedsEdit, replyMessage, adminStats, roleChanged, settingsUpdated, unauthorized, error, cancelled, courseChangeRequestCreated, derivePlatform, escapeHtml };
