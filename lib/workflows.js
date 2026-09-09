// lib/workflows.js — Submission state machine and workflow helpers

import { SUBMISSION_STATUS } from './config.js';
import { REQUEST_STATUS } from './config.js';
import { SUGGESTION_STATUS } from './config.js';

// Valid state transitions for submissions
var VALID_TRANSITIONS = {};
VALID_TRANSITIONS[SUBMISSION_STATUS.PENDING] = [
  SUBMISSION_STATUS.APPROVED,
  SUBMISSION_STATUS.REJECTED,
  SUBMISSION_STATUS.NEEDS_USER_EDIT
];
VALID_TRANSITIONS[SUBMISSION_STATUS.NEEDS_USER_EDIT] = [
  SUBMISSION_STATUS.PENDING
];
VALID_TRANSITIONS[SUBMISSION_STATUS.APPROVED] = [];
VALID_TRANSITIONS[SUBMISSION_STATUS.REJECTED] = [];

// Valid state transitions for course change requests
var VALID_CCR_TRANSITIONS = {};
VALID_CCR_TRANSITIONS[REQUEST_STATUS.PENDING] = [
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.REJECTED
];
VALID_CCR_TRANSITIONS[REQUEST_STATUS.APPROVED] = [];
VALID_CCR_TRANSITIONS[REQUEST_STATUS.REJECTED] = [];

// Valid state transitions for suggestions
var VALID_SUGGESTION_TRANSITIONS = {};
VALID_SUGGESTION_TRANSITIONS[SUGGESTION_STATUS.PENDING] = [
  SUGGESTION_STATUS.APPROVED,
  SUGGESTION_STATUS.REJECTED
];
VALID_SUGGESTION_TRANSITIONS[SUGGESTION_STATUS.APPROVED] = [];
VALID_SUGGESTION_TRANSITIONS[SUGGESTION_STATUS.REJECTED] = [];

function canTransition(currentStatus, newStatus) {
  var valid = VALID_TRANSITIONS[currentStatus];
  if (!valid) return false;
  return valid.indexOf(newStatus) !== -1;
}

function canTransitionCCR(currentStatus, newStatus) {
  var valid = VALID_CCR_TRANSITIONS[currentStatus];
  if (!valid) return false;
  return valid.indexOf(newStatus) !== -1;
}

function canTransitionSuggestion(currentStatus, newStatus) {
  var valid = VALID_SUGGESTION_TRANSITIONS[currentStatus];
  if (!valid) return false;
  return valid.indexOf(newStatus) !== -1;
}

function getValidTransitions(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] || [];
}


export { VALID_TRANSITIONS, VALID_CCR_TRANSITIONS, VALID_SUGGESTION_TRANSITIONS, canTransition, canTransitionCCR, canTransitionSuggestion, getValidTransitions };
