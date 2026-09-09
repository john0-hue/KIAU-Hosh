import { Bot } from 'grammy';
import {
  getUser,
  upsertUser,
  setRole,
  getSetting,
  setSetting,
  audit,
} from './db.js';
import { DEFAULT_LANG, ROLES, INITIAL_ADMIN_IDS } from './config.js';

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error('BOT_TOKEN is not configured');
}

export const telegramBot = new Bot(token);

// Compatibility adapter.
// Supports both:
//   bot.sendMessage(chatId, text, options)
// and:
//   bot.sendMessage({ chat_id, text, ...options })
export const bot = {
  sendMessage(chatId, text, options = {}) {
    if (typeof chatId === 'object' && chatId !== null) {
      const payload = chatId;

      return telegramBot.api.sendMessage(
        payload.chat_id,
        payload.text,
        payload,
      );
    }

    return telegramBot.api.sendMessage(chatId, text, options);
  },

  editMessageText(text, options = {}) {
    if (typeof text === 'object' && text !== null) {
      const {
        chat_id,
        message_id,
        text: messageText,
        ...other
      } = text;
  
      return telegramBot.api.editMessageText(
        chat_id,
        message_id,
        messageText,
        other,
      );
    }
  
    return telegramBot.api.editMessageText(
      options.chat_id,
      options.message_id,
      text,
      options,
    );
  },

  answerCallbackQuery(callbackQueryId, options = {}) {
    return telegramBot.api.answerCallbackQuery({
      callback_query_id: callbackQueryId,
      ...options,
    });
  },
};

export async function ensureSettings() {
  const defaults = [
    ['supervisors_group_id', process.env.SUPERVISORS_GROUP_ID || ''],
    ['admin_only_group_id', process.env.ADMIN_ONLY_GROUP_ID || ''],
  ];

  for (const [key, value] of defaults) {
    if ((await getSetting(key)) === null) {
      await setSetting(key, value);
    }
  }
}

export async function ensureUser(from) {
  await ensureSettings();

  let user = await getUser(from.id);

  user = await upsertUser(
    from.id,
    from.first_name || '',
    from.last_name || '',
    from.username || '',
    from.language_code || DEFAULT_LANG,
  );

  if (
    INITIAL_ADMIN_IDS.includes(Number(from.id)) &&
    user.role !== ROLES.ADMIN
  ) {
    await setRole(from.id, ROLES.ADMIN);

    await audit(
      from.id,
      ROLES.ADMIN,
      'auto_admin',
      'user',
      from.id,
      user.role,
      ROLES.ADMIN,
    );

    user = await getUser(from.id);
  }

  return user;
}