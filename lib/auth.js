// lib/auth.js — Authorization and permission checks

import { ROLES } from './config.js';

const ROLE_HIERARCHY = {};
ROLE_HIERARCHY[ROLES.USER] = 0;
ROLE_HIERARCHY[ROLES.COADMIN] = 1;
ROLE_HIERARCHY[ROLES.ADMIN] = 2;

function hasRole(user, requiredRole) {
  if (!user || !user.role) return false;
  const userLevel = ROLE_HIERARCHY[user.role] !== undefined ? ROLE_HIERARCHY[user.role] : -1;
  const reqLevel = ROLE_HIERARCHY[requiredRole] !== undefined ? ROLE_HIERARCHY[requiredRole] : 999;
  return userLevel >= reqLevel;
}

function isAdmin(user) {
  return hasRole(user, ROLES.ADMIN);
}

function isCoadmin(user) {
  return !!user && user.role === ROLES.COADMIN;
}

function isUser(user) {
  return user && user.role === ROLES.USER;
}

function canModerate(user) {
  return hasRole(user, ROLES.COADMIN);
}

function canAccessAdminPanel(user) {
  return isAdmin(user);
}

function canManageUsers(user) {
  return isAdmin(user);
}

function canManageCourses(user) {
  return isAdmin(user);
}

function canManageSemesters(user) {
  return isAdmin(user);
}

function canCreateCourseDirect(user) {
  return isAdmin(user);
}

function canApproveSubmissions(user) {
  return canModerate(user);
}

function canRejectSubmissions(user) {
  return canModerate(user);
}

function canReplyToSubmissions(user) {
  return canModerate(user);
}

function canRequestCourseChange(user) {
  return canModerate(user);
}

function canApproveCourseChanges(user) {
  return isAdmin(user);
}

function canConfigureGroups(user) {
  return isAdmin(user);
}

export { ROLE_HIERARCHY, hasRole, isAdmin, isCoadmin, isUser, canModerate, canAccessAdminPanel, canManageUsers, canManageCourses, canManageSemesters, canCreateCourseDirect, canApproveSubmissions, canRejectSubmissions, canReplyToSubmissions, canRequestCourseChange, canApproveCourseChanges, canConfigureGroups };
