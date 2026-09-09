// lib/validation.js — Input validation

import { LIMITS } from './config.js';

function validateCourseName(name) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'نام درس الزامی است.' };
  var s = name.trim();
  if (s.length < 2) return { ok: false, error: 'نام درس باید حداقل ۲ کاراکتر باشد.' };
  if (s.length > LIMITS.COURSE_NAME) return { ok: false, error: 'نام درس بیش از حد طولانی است.' };
  return { ok: true, value: s };
}

function validateInstructorName(name) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'نام استاد الزامی است.' };
  var s = name.trim();
  if (s.length < 2) return { ok: false, error: 'نام استاد باید حداقل ۲ کاراکتر باشد.' };
  if (s.length > LIMITS.INSTRUCTOR_NAME) return { ok: false, error: 'نام استاد بیش از حد طولانی است.' };
  return { ok: true, value: s };
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return { ok: false, error: 'لینک الزامی است.' };
  var s = url.trim();
  if (s.length < LIMITS.URL_MIN) return { ok: false, error: 'لینک بسیار کوتاه است.' };
  if (s.length > LIMITS.URL_MAX) return { ok: false, error: 'لینک بیش از حد طولانی است.' };

  // Accept any HTTP(S) destination. The bot must not whitelist or guess a
  // particular virtual-course platform.
  if (!/^https?:\/\/[^\s]+$/i.test(s)) {
    return { ok: false, error: 'لینک معتبر نیست. لینک باید با http:// یا https:// شروع شود.' };
  }

  if (/^(?:javascript|data|vbscript):/i.test(s)) {
    return { ok: false, error: 'لینک معتبر نیست.' };
  }

  return { ok: true, value: s };
}

function validateSemesterName(name) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'نام ترم الزامی است.' };
  var s = name.trim();
  if (s.length < 2) return { ok: false, error: 'نام ترم باید حداقل ۲ کاراکتر باشد.' };
  if (s.length > LIMITS.SEMESTER_NAME) return { ok: false, error: 'نام ترم بیش از حد طولانی است.' };
  return { ok: true, value: s };
}

function validateSemesterCode(code) {
  if (!code || typeof code !== 'string') return { ok: false, error: 'کد ترم الزامی است.' };
  var s = code.trim();
  if (!/^\d{5}$/.test(s)) return { ok: false, error: 'کد ترم باید ۵ رقمی باشد (مثال: ۱۴۰۵۲).' };
  return { ok: true, value: s };
}

function validateFeedback(text) {
  if (!text || typeof text !== 'string') return { ok: false, error: 'متن پیام الزامی است.' };
  var s = text.trim();
  if (s.length < 2) return { ok: false, error: 'متن باید حداقل ۲ کاراکتر باشد.' };
  if (s.length > LIMITS.FEEDBACK) return { ok: false, error: 'متن بیش از حد طولانی است.' };
  return { ok: true, value: s };
}

function validateTelegramId(id) {
  if (!id) return { ok: false, error: 'شناسه کاربر الزامی است.' };
  var n = parseInt(id, 10);
  if (isNaN(n) || n <= 0) return { ok: false, error: 'شناسه کاربر باید یک عدد مثبت باشد.' };
  return { ok: true, value: n };
}

function validateRole(role) {
  var valid = ['user', 'coadmin', 'admin'];
  if (valid.indexOf(role) === -1) return { ok: false, error: 'نقش معتبر نیست.' };
  return { ok: true, value: role };
}

function validateSettingsValue(value) {
  if (value === null || value === undefined) return { ok: false, error: 'مقدار الزامی است.' };
  var s = String(value).trim();
  if (s.length === 0) return { ok: false, error: 'مقدار نمی‌تواند خالی باشد.' };
  if (s.length > 200) return { ok: false, error: 'مقدار بیش از حد طولانی است.' };
  return { ok: true, value: s };
}


export { validateCourseName, validateInstructorName, validateUrl, validateSemesterName, validateSemesterCode, validateFeedback, validateTelegramId, validateRole, validateSettingsValue };
