// lib/sessions.js — Session state management

import { getSession as dbGetSession, createSession as dbCreateSession, updateSession as dbUpdateSession, deleteSession as dbDeleteSession } from './db.js';
import { SESSION_STATE } from './config.js';

async function getSession(userId) {
  const session = await dbGetSession(userId);
  if (!session) return null;
  return session;
}

async function startSession(userId, state, data) {
  return await dbCreateSession(userId, state, data);
}

async function updateSession(userId, state, data) {
  return await dbUpdateSession(userId, state, data);
}

async function endSession(userId) {
  return await dbDeleteSession(userId);
}

function parseData(session) {
  if (!session || !session.data) return {};
  try {
    return JSON.parse(session.data);
  } catch (e) {
    return {};
  }
}

function isActive(session) {
  return session && session.state && session.state !== SESSION_STATE.NONE;
}


export { getSession, startSession, updateSession, endSession, parseData, isActive };
