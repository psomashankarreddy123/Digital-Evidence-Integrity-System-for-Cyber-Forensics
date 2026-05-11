const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const APP_NAME = 'Digital Evidence Integrity Management System for Cyber Forensics';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const EVIDENCE_INDEX_PATH = path.join(DATA_DIR, 'evidence-index.json');
const AUDIT_LOG_PATH = path.join(DATA_DIR, 'audit-log.json');
const FOLDERS_PATH = path.join(DATA_DIR, 'folders.json');
const CASES_PATH = path.join(DATA_DIR, 'cases.json');
const COMMENTS_PATH = path.join(DATA_DIR, 'comments.json');
const APPROVALS_PATH = path.join(DATA_DIR, 'approvals.json');
const NOTIFICATIONS_PATH = path.join(DATA_DIR, 'notifications.json');
const COMPLIANCE_SETTINGS_PATH = path.join(DATA_DIR, 'compliance-settings.json');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MS = 1000 * 60 * 15;
const MAX_IP_WINDOW_ATTEMPTS = 12;
const IP_WINDOW_MS = 1000 * 60 * 10;

const sessions = new Map();
const loginAttemptStore = new Map();

bootstrap();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`${APP_NAME} running on http://localhost:${PORT}`);
});

function bootstrap() {
  ensureDir(DATA_DIR);
  ensureDir(EVIDENCE_DIR);
  if (!fs.existsSync(SECRETS_PATH)) {
    writeJson(SECRETS_PATH, {
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      encryptionKey: crypto.randomBytes(32).toString('hex')
    });
  }
  const existingUsers = fs.existsSync(USERS_PATH) ? readJson(USERS_PATH, []) : [];
  writeJson(USERS_PATH, ensureDefaultUsers(existingUsers));

  const existingFolders = fs.existsSync(FOLDERS_PATH) ? readJson(FOLDERS_PATH, []) : [];
  let folders = ensureDefaultFolders(existingFolders);
  const existingCases = fs.existsSync(CASES_PATH) ? readJson(CASES_PATH, []) : [];
  const cases = ensureDefaultCases(existingCases);
  writeJson(CASES_PATH, cases);
  folders = ensureFolderCaseDefaults(folders, cases);
  writeJson(FOLDERS_PATH, folders);
  folders.forEach((folder) => ensureDir(path.join(EVIDENCE_DIR, folder.id)));
  if (!fs.existsSync(EVIDENCE_INDEX_PATH)) {
    writeJson(EVIDENCE_INDEX_PATH, []);
  } else {
    writeJson(EVIDENCE_INDEX_PATH, normalizeEvidenceRecords(readJson(EVIDENCE_INDEX_PATH, [])));
  }
  if (!fs.existsSync(AUDIT_LOG_PATH)) {
    writeJson(AUDIT_LOG_PATH, []);
  } else {
    writeJson(AUDIT_LOG_PATH, normalizeAuditLogs(readJson(AUDIT_LOG_PATH, [])));
  }
  if (!fs.existsSync(COMMENTS_PATH)) {
    writeJson(COMMENTS_PATH, []);
  } else {
    writeJson(COMMENTS_PATH, normalizeComments(readJson(COMMENTS_PATH, [])));
  }
  if (!fs.existsSync(APPROVALS_PATH)) {
    writeJson(APPROVALS_PATH, []);
  } else {
    writeJson(APPROVALS_PATH, normalizeApprovals(readJson(APPROVALS_PATH, [])));
  }
  if (!fs.existsSync(NOTIFICATIONS_PATH)) {
    writeJson(NOTIFICATIONS_PATH, []);
  } else {
    writeJson(NOTIFICATIONS_PATH, normalizeNotifications(readJson(NOTIFICATIONS_PATH, [])));
  }
  if (!fs.existsSync(COMPLIANCE_SETTINGS_PATH)) {
    writeJson(COMPLIANCE_SETTINGS_PATH, defaultComplianceSettings());
  } else {
    writeJson(COMPLIANCE_SETTINGS_PATH, normalizeComplianceSettings(readJson(COMPLIANCE_SETTINGS_PATH, {})));
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const session = getSession(req);
  const user = session ? getUserById(session.userId) : null;

  if (pathname.startsWith('/assets/')) {
    return serveStatic(res, path.join(PUBLIC_DIR, pathname.replace('/assets/', '')));
  }

  if (req.method === 'GET' && pathname === '/') {
    return sendHtml(res, pageTemplate({ user, role: user?.role || null, view: 'landing' }));
  }

  if (req.method === 'GET' && pathname === '/login/admin') {
    return sendHtml(res, pageTemplate({ user, role: 'admin', view: 'login' }));
  }

  if (req.method === 'GET' && pathname === '/login/supervisor') {
    return sendHtml(res, pageTemplate({ user, role: 'supervisor', view: 'login' }));
  }

  if (req.method === 'GET' && pathname === '/login/investigator') {
    return sendHtml(res, pageTemplate({ user, role: 'investigator', view: 'login' }));
  }

  if (req.method === 'GET' && pathname === '/login/reviewer') {
    return sendHtml(res, pageTemplate({ user, role: 'external_reviewer', view: 'login' }));
  }

  if (req.method === 'GET' && pathname === '/admin') {
    requireUserPage(res, user, 'admin');
    if (res.writableEnded) return;
    return sendHtml(res, pageTemplate({ user, role: 'admin', view: 'dashboard' }));
  }

  if (req.method === 'GET' && pathname === '/investigator') {
    requireUserPage(res, user, 'investigator');
    if (res.writableEnded) return;
    return sendHtml(res, pageTemplate({ user, role: 'investigator', view: 'dashboard' }));
  }

  if (req.method === 'GET' && pathname === '/supervisor') {
    requireUserPage(res, user, 'supervisor');
    if (res.writableEnded) return;
    return sendHtml(res, pageTemplate({ user, role: 'supervisor', view: 'dashboard' }));
  }

  if (req.method === 'GET' && pathname === '/reviewer') {
    requireUserPage(res, user, 'external_reviewer');
    if (res.writableEnded) return;
    return sendHtml(res, pageTemplate({ user, role: 'external_reviewer', view: 'dashboard' }));
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    return handleLogin(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    return handleLogout(req, res, user);
  }

  const dismissNotificationMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/dismiss$/);
  if (req.method === 'POST' && dismissNotificationMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleDismissNotification(req, res, auth, dismissNotificationMatch[1]);
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    return sendJson(res, 200, {
      authenticated: Boolean(user),
      user: sanitizeUser(user)
    });
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildDashboardPayload(auth));
  }

  if (req.method === 'GET' && pathname === '/api/notifications') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildNotificationPayload(auth));
  }

  if (req.method === 'GET' && pathname === '/api/evidence') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildEvidenceList(auth, url.searchParams));
  }

  if (req.method === 'GET' && pathname === '/api/approvals') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildApprovalPayload(auth));
  }

  if (req.method === 'GET' && pathname === '/api/folders') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, { folders: getFolders({ includeArchived: user.role === 'admin' }) });
  }

  if (req.method === 'GET' && pathname === '/api/cases') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildCasePayload(auth));
  }

  if (req.method === 'GET' && pathname === '/api/investigators') {
    const auth = requireApiUser(res, user, null);
    if (!auth || !isOpsUser(auth)) {
      if (!auth) return;
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    return sendJson(res, 200, buildInvestigatorPayload());
  }

  if (req.method === 'POST' && pathname === '/api/cases') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleCreateCase(req, res, auth);
  }

  const assignCaseInvestigatorsMatch = pathname.match(/^\/api\/cases\/([^/]+)\/assign-investigators$/);
  if (req.method === 'POST' && assignCaseInvestigatorsMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth || !isOpsUser(auth)) {
      if (!auth) return;
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    return handleAssignCaseInvestigators(req, res, auth, assignCaseInvestigatorsMatch[1]);
  }

  const caseFeedMatch = pathname.match(/^\/api\/cases\/([^/]+)\/feed$/);
  if (req.method === 'GET' && caseFeedMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildCaseFeedPayload(auth, caseFeedMatch[1]));
  }

  if (req.method === 'POST' && pathname === '/api/folders') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleCreateFolder(req, res, auth);
  }

  const renameFolderMatch = pathname.match(/^\/api\/folders\/([^/]+)\/rename$/);
  if (req.method === 'POST' && renameFolderMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleRenameFolder(req, res, auth, renameFolderMatch[1]);
  }

  const archiveFolderMatch = pathname.match(/^\/api\/folders\/([^/]+)\/toggle-archive$/);
  if (req.method === 'POST' && archiveFolderMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleToggleFolderArchive(req, res, auth, archiveFolderMatch[1]);
  }

  const assignFolderCaseMatch = pathname.match(/^\/api\/folders\/([^/]+)\/assign-case$/);
  if (req.method === 'POST' && assignFolderCaseMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleAssignFolderCase(req, res, auth, assignFolderCaseMatch[1]);
  }

  const deleteFolderMatch = pathname.match(/^\/api\/folders\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteFolderMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleDeleteFolder(req, res, auth, deleteFolderMatch[1]);
  }

  if (req.method === 'POST' && pathname === '/api/evidence/upload') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleEvidenceUpload(req, res, auth);
  }

  const verifyMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/verify$/);
  if (req.method === 'POST' && verifyMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleVerifyEvidence(req, res, auth, verifyMatch[1]);
  }

  const previewMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/preview$/);
  if (req.method === 'GET' && previewMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handlePreviewEvidence(res, auth, previewMatch[1]);
  }

  const commentsMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/comments$/);
  if (req.method === 'GET' && commentsMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildEvidenceCommentsPayload(auth, commentsMatch[1]));
  }
  if (req.method === 'POST' && commentsMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleCreateEvidenceComment(req, res, auth, commentsMatch[1]);
  }

  const downloadMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/download$/);
  if (req.method === 'GET' && downloadMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleDownloadEvidence(res, auth, downloadMatch[1]);
  }

  if (req.method === 'POST' && pathname === '/api/approvals') {
    const auth = requireApiUser(res, user, null);
    if (!auth || !isOpsUser(auth)) {
      if (!auth) return;
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    return handleCreateApprovalRequest(req, res, auth);
  }

  const approvalDecisionMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  if (req.method === 'POST' && approvalDecisionMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth || !canReviewApprovals(auth)) {
      if (!auth) return;
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    return handleApprovalDecision(req, res, auth, approvalDecisionMatch[1]);
  }

  const deleteEvidenceMatch = pathname.match(/^\/api\/evidence\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteEvidenceMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleDeleteEvidence(req, res, auth, deleteEvidenceMatch[1]);
  }

  if (req.method === 'GET' && pathname === '/api/audit-logs') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendJson(res, 200, buildAuditLogPayload(url.searchParams));
  }

  if (req.method === 'GET' && pathname === '/api/users') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return sendJson(res, 200, buildUserManagementPayload());
  }

  if (req.method === 'POST' && pathname === '/api/users') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleCreateInvestigator(req, res, auth);
  }

  const toggleUserMatch = pathname.match(/^\/api\/users\/([^/]+)\/toggle-status$/);
  if (req.method === 'POST' && toggleUserMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleToggleUserStatus(req, res, auth, toggleUserMatch[1]);
  }

  const resetPasswordMatch = pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (req.method === 'POST' && resetPasswordMatch) {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleResetUserPassword(req, res, auth, resetPasswordMatch[1]);
  }

  if (req.method === 'POST' && pathname === '/api/external-reviewers') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleCreateExternalReviewer(req, res, auth);
  }

  if (req.method === 'GET' && pathname === '/api/compliance-schedule') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return sendJson(res, 200, { settings: getComplianceSettings() });
  }

  if (req.method === 'POST' && pathname === '/api/compliance-schedule') {
    const auth = requireApiUser(res, user, 'admin');
    if (!auth) return;
    return handleUpdateComplianceSchedule(req, res, auth);
  }

  if (req.method === 'GET' && pathname === '/audit-report') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendHtml(res, reportTemplate(auth));
  }

  const caseReportMatch = pathname.match(/^\/reports\/cases\/([^/]+)$/);
  if (req.method === 'GET' && caseReportMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendHtml(res, caseReportTemplate(auth, caseReportMatch[1]));
  }

  const evidenceCertificateMatch = pathname.match(/^\/reports\/evidence\/([^/]+)\/certificate$/);
  if (req.method === 'GET' && evidenceCertificateMatch) {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return sendHtml(res, evidenceCertificateTemplate(auth, evidenceCertificateMatch[1]));
  }

  if (req.method === 'GET' && pathname === '/exports/cases.csv') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleCaseCsvExport(res, auth);
  }

  if (req.method === 'GET' && pathname === '/exports/evidence.csv') {
    const auth = requireApiUser(res, user, null);
    if (!auth) return;
    return handleEvidenceCsvExport(res, auth);
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const allowedRoles = new Set(['admin', 'investigator', 'supervisor', 'external_reviewer']);
  const role = allowedRoles.has(String(body.role || '')) ? String(body.role) : null;
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!role || !username || !password) {
    return sendJson(res, 400, { error: 'Role, username, and password are required.' });
  }

  const ipAddress = getIp(req);
  if (isIpRateLimited(ipAddress)) {
    appendAuditLog({
      user: username || 'Unknown',
      role,
      action: 'Login attempt',
      status: 'Failed',
      detail: 'IP rate limit triggered',
      ipAddress
    });
    return sendJson(res, 429, { error: 'Too many login attempts. Please wait and try again.' });
  }

  const users = getUsers();
  const user = users.find((entry) => entry.username === username && entry.role === role);

  if (user?.status === 'disabled') {
    appendAuditLog({
      user: username || 'Unknown',
      role,
      action: 'Login attempt',
      status: 'Failed',
      detail: 'Disabled account sign-in blocked',
      ipAddress
    });
    return sendJson(res, 403, { error: 'This account is disabled. Contact an administrator.' });
  }

  if (user?.expiresAt && new Date(user.expiresAt).getTime() < Date.now()) {
    appendAuditLog({
      user: username || 'Unknown',
      role,
      action: 'Login attempt',
      status: 'Failed',
      detail: 'Temporary access has expired',
      ipAddress
    });
    return sendJson(res, 403, { error: 'This temporary access window has expired.' });
  }

  if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    appendAuditLog({
      user: username || 'Unknown',
      role,
      action: 'Login attempt',
      status: 'Failed',
      detail: 'Account temporarily locked',
      ipAddress
    });
    return sendJson(res, 423, { error: `Account locked until ${new Date(user.lockedUntil).toLocaleTimeString()}.` });
  }

  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    registerIpFailure(ipAddress);
    if (user) {
      user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
      user.lastFailedLoginAt = new Date().toISOString();
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + ACCOUNT_LOCK_MS).toISOString();
      }
      saveUsers(users);
    }
    appendAuditLog({
      user: username || 'Unknown',
      role,
      action: 'Login attempt',
      status: 'Failed',
      detail: user?.lockedUntil
        ? `Failed ${role} login - account locked`
        : `Failed ${role} login`,
      ipAddress
    });
    return sendJson(res, 401, { error: 'Invalid credentials.' });
  }

  clearIpFailures(ipAddress);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastFailedLoginAt = null;
  user.lastLoginAt = new Date().toISOString();
  saveUsers(users);

  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, { userId: user.id, expiresAt });
  setSessionCookie(res, sessionId, expiresAt);
  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Login',
    status: 'Success',
    detail: `Authenticated as ${user.role}`,
    ipAddress
  });

  sendJson(res, 200, {
    ok: true,
    redirectTo: roleDashboardPath(user.role),
    user: sanitizeUser(user)
  });
}

async function handleLogout(req, res, user) {
  const cookie = parseCookies(req.headers.cookie || '').deims_session;
  if (cookie) {
    const sessionId = verifySignedValue(cookie, getSecrets().sessionSecret);
    if (sessionId) sessions.delete(sessionId);
  }
  res.setHeader(
    'Set-Cookie',
    'deims_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
  );
  if (user) {
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Logout',
      status: 'Success',
      detail: 'User signed out',
      ipAddress: getIp(req)
    });
  }
  sendJson(res, 200, { ok: true, redirectTo: '/' });
}

async function handleCreateInvestigator(req, res, adminUser) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');

  if (!username || !displayName || !password) {
    return sendJson(res, 400, { error: 'Username, display name, and password are required.' });
  }

  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    return sendJson(res, 400, { error: 'Username must be 4-32 characters and use lowercase letters, numbers, dot, dash, or underscore.' });
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.ok) {
    return sendJson(res, 400, { error: passwordValidation.error });
  }

  const users = getUsers();
  if (users.some((user) => user.username === username)) {
    return sendJson(res, 409, { error: 'That username is already in use.' });
  }

  const investigator = createUser(username, displayName, 'investigator', password);
  users.push(investigator);
  saveUsers(users);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'User management',
    status: 'Success',
    detail: `Created investigator account ${investigator.username}`,
    ipAddress: 'session'
  });

  sendJson(res, 201, {
    ok: true,
    user: sanitizeManagedUser(investigator)
  });
}

async function handleCreateCase(req, res, adminUser) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const caseNumber = String(body.caseNumber || '').trim().toUpperCase();
  const title = String(body.title || '').trim();
  const suspectName = String(body.suspectName || '').trim();
  const department = String(body.department || '').trim();
  const notes = String(body.notes || '').trim();
  const findings = String(body.findings || '').trim();
  const assignedInvestigatorIds = Array.isArray(body.assignedInvestigatorIds)
    ? body.assignedInvestigatorIds.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (!caseNumber || !title || !department) {
    return sendJson(res, 400, { error: 'Case number, title, and department are required.' });
  }

  const cases = getCases();
  if (cases.some((entry) => entry.caseNumber === caseNumber)) {
    return sendJson(res, 409, { error: 'That case number already exists.' });
  }

  const investigators = getUsers().filter((entry) => entry.role === 'investigator');
  const assignedInvestigators = investigators.filter((entry) => assignedInvestigatorIds.includes(entry.id));

  const forensicCase = {
    id: crypto.randomUUID(),
    caseNumber,
    title,
    suspectName,
    department,
    status: 'active',
    assignedInvestigatorIds: assignedInvestigators.map((entry) => entry.id),
    assignedInvestigatorNames: assignedInvestigators.map((entry) => entry.displayName),
    notes,
    findings,
    milestones: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  cases.unshift(forensicCase);
  saveCases(cases);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Case management',
    status: 'Success',
    detail: `Created case ${forensicCase.caseNumber}`,
    ipAddress: 'session'
  });

  return sendJson(res, 201, { ok: true, case: sanitizeCase(forensicCase) });
}

async function handleAssignCaseInvestigators(req, res, actor, caseId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const assignedInvestigatorIds = Array.isArray(body.assignedInvestigatorIds)
    ? body.assignedInvestigatorIds.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const cases = getCases();
  const forensicCase = cases.find((entry) => entry.id === caseId);
  if (!forensicCase) {
    return sendJson(res, 404, { error: 'Case not found.' });
  }

  const investigators = getUsers().filter((entry) => entry.role === 'investigator');
  const assignedInvestigators = investigators.filter((entry) => assignedInvestigatorIds.includes(entry.id));
  forensicCase.assignedInvestigatorIds = assignedInvestigators.map((entry) => entry.id);
  forensicCase.assignedInvestigatorNames = assignedInvestigators.map((entry) => entry.displayName);
  forensicCase.updatedAt = new Date().toISOString();
  saveCases(cases);

  appendAuditLog({
    user: actor.displayName,
    role: actor.role,
    action: 'Case assignment',
    status: 'Success',
    detail: `Updated investigator assignment for ${forensicCase.caseNumber}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, case: sanitizeCase(forensicCase) });
}

async function handleCreateFolder(req, res, adminUser) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const requestedCaseId = String(body.caseId || '').trim();
  if (!name) {
    return sendJson(res, 400, { error: 'Folder name is required.' });
  }

  const folders = getFolders({ includeArchived: true });
  const id = slugifyFolderName(name);
  if (!id) {
    return sendJson(res, 400, { error: 'Folder name must contain letters or numbers.' });
  }
  if (folders.some((folder) => folder.id === id)) {
    return sendJson(res, 409, { error: 'A folder with that name already exists.' });
  }

  const linkedCase = requestedCaseId ? getCases().find((entry) => entry.id === requestedCaseId) : null;
  if (requestedCaseId && !linkedCase) {
    return sendJson(res, 404, { error: 'Selected case was not found.' });
  }

  const folder = {
    id,
    name,
    description,
    status: 'active',
    createdAt: new Date().toISOString(),
    caseId: linkedCase?.id || null,
    caseNumber: linkedCase?.caseNumber || null,
    caseTitle: linkedCase?.title || null
  };
  folders.push(folder);
  saveFolders(folders);
  ensureDir(path.join(EVIDENCE_DIR, id));

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Folder management',
    status: 'Success',
    detail: `Created folder ${folder.name}`,
    ipAddress: 'session'
  });

  sendJson(res, 201, { ok: true, folder });
}

async function handleAssignFolderCase(req, res, adminUser, folderId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const nextCaseId = String(body.caseId || '').trim();
  const folders = getFolders({ includeArchived: true });
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return sendJson(res, 404, { error: 'Folder not found.' });
  }

  const linkedCase = nextCaseId ? getCases().find((entry) => entry.id === nextCaseId) : null;
  if (nextCaseId && !linkedCase) {
    return sendJson(res, 404, { error: 'Selected case was not found.' });
  }

  folder.caseId = linkedCase?.id || null;
  folder.caseNumber = linkedCase?.caseNumber || null;
  folder.caseTitle = linkedCase?.title || null;
  saveFolders(folders);

  const evidence = getEvidence();
  let evidenceChanged = false;
  evidence.forEach((entry) => {
    if (entry.folderId === folderId) {
      entry.caseId = folder.caseId;
      entry.caseNumber = folder.caseNumber;
      entry.caseTitle = folder.caseTitle;
      evidenceChanged = true;
    }
  });
  if (evidenceChanged) {
    writeJson(EVIDENCE_INDEX_PATH, normalizeEvidenceRecords(evidence));
  }

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Case management',
    status: 'Success',
    detail: linkedCase
      ? `Linked folder ${folder.name} to case ${linkedCase.caseNumber}`
      : `Removed case link from folder ${folder.name}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, folder: sanitizeFolder(folder) });
}

async function handleRenameFolder(req, res, adminUser, folderId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  if (!name) {
    return sendJson(res, 400, { error: 'Folder name is required.' });
  }

  const folders = getFolders({ includeArchived: true });
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return sendJson(res, 404, { error: 'Folder not found.' });
  }

  folder.name = name;
  folder.description = description;
  saveFolders(folders);

  const evidence = getEvidence();
  let changed = false;
  evidence.forEach((entry) => {
    if (entry.folderId === folder.id) {
      entry.folderName = folder.name;
      changed = true;
    }
  });
  if (changed) {
    writeJson(EVIDENCE_INDEX_PATH, evidence);
  }

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Folder management',
    status: 'Success',
    detail: `Renamed folder ${folder.id} to ${folder.name}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, folder });
}

async function handleToggleFolderArchive(req, res, adminUser, folderId) {
  const folders = getFolders({ includeArchived: true });
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return sendJson(res, 404, { error: 'Folder not found.' });
  }

  folder.status = folder.status === 'archived' ? 'active' : 'archived';
  saveFolders(folders);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Folder management',
    status: 'Success',
    detail: `${folder.name} ${folder.status === 'archived' ? 'archived' : 'restored'}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, folder });
}

async function handleDeleteFolder(req, res, adminUser, folderId) {
  const folders = getFolders({ includeArchived: true });
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) {
    return sendJson(res, 404, { error: 'Folder not found.' });
  }

  const evidenceCount = getEvidence().filter((entry) => entry.folderId === folderId).length;
  if (evidenceCount > 0) {
    return sendJson(res, 409, { error: 'Folder cannot be deleted while it still contains evidence.' });
  }

  const remainingFolders = folders.filter((entry) => entry.id !== folderId);
  saveFolders(remainingFolders);

  const folderPath = path.resolve(path.join(EVIDENCE_DIR, folderId));
  const evidenceRoot = path.resolve(EVIDENCE_DIR);
  if (folderPath.startsWith(evidenceRoot) && fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Folder management',
    status: 'Success',
    detail: `Deleted folder ${folder.name}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, deletedFolderId: folderId });
}

async function handleToggleUserStatus(req, res, adminUser, userId) {
  const users = getUsers();
  const managedUser = users.find((user) => user.id === userId);

  if (!managedUser || managedUser.role !== 'investigator') {
    return sendJson(res, 404, { error: 'Investigator account not found.' });
  }

  managedUser.status = managedUser.status === 'disabled' ? 'active' : 'disabled';
  managedUser.failedLoginAttempts = 0;
  managedUser.lockedUntil = null;
  managedUser.lastFailedLoginAt = null;
  saveUsers(users);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'User management',
    status: 'Success',
    detail: `${managedUser.username} ${managedUser.status === 'disabled' ? 'disabled' : 'enabled'}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, {
    ok: true,
    user: sanitizeManagedUser(managedUser)
  });
}

async function handleResetUserPassword(req, res, adminUser, userId) {
  const users = getUsers();
  const managedUser = users.find((user) => user.id === userId);

  if (!managedUser || managedUser.role !== 'investigator') {
    return sendJson(res, 404, { error: 'Investigator account not found.' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  managedUser.passwordSalt = salt;
  managedUser.passwordHash = hashPassword(temporaryPassword, salt);
  managedUser.failedLoginAttempts = 0;
  managedUser.lockedUntil = null;
  managedUser.lastFailedLoginAt = null;
  saveUsers(users);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'User management',
    status: 'Success',
    detail: `${managedUser.username} password reset`,
    ipAddress: 'session'
  });

  sendJson(res, 200, {
    ok: true,
    user: sanitizeManagedUser(managedUser),
    temporaryPassword
  });
}

async function handleCreateExternalReviewer(req, res, adminUser) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const displayName = String(body.displayName || '').trim();
  const caseId = String(body.caseId || '').trim();
  const expiresInHours = Math.max(1, Math.min(72, Number(body.expiresInHours || 24)));
  if (!displayName || !caseId) {
    return sendJson(res, 400, { error: 'Display name and case are required for reviewer access.' });
  }

  const forensicCase = getCases().find((entry) => entry.id === caseId);
  if (!forensicCase) {
    return sendJson(res, 404, { error: 'Selected case was not found.' });
  }

  const users = getUsers();
  const username = `reviewer-${crypto.randomBytes(3).toString('hex')}`;
  const temporaryPassword = `Rev-${crypto.randomBytes(4).toString('hex')}!9a`;
  const reviewer = createUser(username, displayName, 'external_reviewer', temporaryPassword);
  reviewer.allowedCaseIds = [forensicCase.id];
  reviewer.expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  users.push(reviewer);
  saveUsers(users);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'External reviewer',
    status: 'Success',
    detail: `Provisioned temporary reviewer ${reviewer.username} for ${forensicCase.caseNumber}`,
    ipAddress: 'session'
  });

  sendJson(res, 201, {
    ok: true,
    user: sanitizeManagedUser(reviewer),
    temporaryPassword
  });
}

async function handleEvidenceUpload(req, res, user) {
  const fileNameHeader = decodeURIComponent(req.headers['x-file-name'] || '');
  const fileType = String(req.headers['x-file-type'] || 'application/octet-stream');
  const requestedFolderId = String(req.headers['x-folder-id'] || '').trim();
  const requestedCaseId = String(req.headers['x-case-id'] || '').trim();
  const deviceSource = String(req.headers['x-device-source'] || '').trim();
  const seizureDate = String(req.headers['x-seizure-date'] || '').trim();
  const incidentType = String(req.headers['x-incident-type'] || '').trim();
  const severity = normalizeSeverity(req.headers['x-severity']);
  const investigatorNotes = String(req.headers['x-investigator-notes'] || '').trim();
  const tags = parseTagsHeader(req.headers['x-tags']);
  const contentLength = Number(req.headers['content-length'] || 0);

  if (!fileNameHeader) {
    return sendJson(res, 400, { error: 'Missing file metadata.' });
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    return sendJson(res, 413, { error: 'File exceeds 25 MB limit.' });
  }

  const uploadBuffer = await readRawBody(req, res, MAX_UPLOAD_BYTES);
  if (!uploadBuffer) return;

  const folders = getFolders();
  const selectedFolder = folders.find((folder) => folder.id === requestedFolderId) || folders[0];
  if (!selectedFolder) {
    return sendJson(res, 400, { error: 'No evidence folders are available.' });
  }
  if (requestedCaseId && selectedFolder.caseId && selectedFolder.caseId !== requestedCaseId) {
    return sendJson(res, 409, { error: 'Selected folder belongs to a different case.' });
  }

  const linkedCase = requestedCaseId
    ? getCases().find((entry) => entry.id === requestedCaseId)
    : selectedFolder.caseId
      ? getCases().find((entry) => entry.id === selectedFolder.caseId)
      : null;
  if (requestedCaseId && !linkedCase) {
    return sendJson(res, 404, { error: 'Selected case was not found.' });
  }

  const evidenceId = `EV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const originalHash = crypto.createHash('sha256').update(uploadBuffer).digest('hex');
  const encrypted = encryptBuffer(uploadBuffer);
  const fileExt = path.extname(fileNameHeader) || '';
  const storagePath = path.join(EVIDENCE_DIR, selectedFolder.id, `${evidenceId}${fileExt}.enc`);
  fs.writeFileSync(storagePath, encrypted.payload);

  const entry = {
    id: evidenceId,
    fileName: fileNameHeader,
    fileType,
    fileSize: uploadBuffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.displayName,
    uploaderId: user.id,
    role: user.role,
    folderId: selectedFolder.id,
    folderName: selectedFolder.name,
    caseId: linkedCase?.id || selectedFolder.caseId || null,
    caseNumber: linkedCase?.caseNumber || selectedFolder.caseNumber || null,
    caseTitle: linkedCase?.title || selectedFolder.caseTitle || null,
    hash: originalHash,
    status: 'Secure',
    integrityLabel: 'Integrity Locked',
    storagePath,
    encryption: {
      iv: encrypted.iv,
      authTag: encrypted.authTag
    },
    lastVerifiedAt: null,
    lastVerifiedBy: null,
    tamperDetectedAt: null,
    metadata: {
      deviceSource,
      seizureDate: normalizeDateString(seizureDate),
      incidentType,
      severity,
      tags,
      investigatorNotes
    }
  };

  const evidence = getEvidence();
  evidence.unshift(entry);
  writeJson(EVIDENCE_INDEX_PATH, evidence);

  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Upload',
    status: 'Success',
    detail: `${entry.id} uploaded`,
    evidenceId: entry.id,
    ipAddress: getIp(req)
  });

  sendJson(res, 201, {
    ok: true,
    evidence: sanitizeEvidence(entry)
  });
}

async function handleVerifyEvidence(req, res, user, evidenceId) {
  const evidence = getEvidence();
  const entry = evidence.find((item) => item.id === evidenceId);
  if (!entry) {
    return sendJson(res, 404, { error: 'Evidence not found.' });
  }

  const decrypted = tryDecryptEvidence(entry);
  const recalculatedHash = decrypted.buffer
    ? crypto.createHash('sha256').update(decrypted.buffer).digest('hex')
    : null;
  const authentic = Boolean(decrypted.buffer) && recalculatedHash === entry.hash;

  entry.lastVerifiedAt = new Date().toISOString();
  entry.lastVerifiedBy = user.displayName;
  entry.status = authentic ? 'Secure' : 'Tampered';
  if (!authentic) entry.tamperDetectedAt = new Date().toISOString();
  writeJson(EVIDENCE_INDEX_PATH, evidence);

  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Verification',
    status: authentic ? 'Success' : 'Alert',
    detail: authentic
      ? `${entry.id} verified authentic`
      : `${entry.id} integrity compromised${decrypted.error ? ` (${decrypted.error})` : ''}`,
    evidenceId: entry.id,
    ipAddress: getIp(req)
  });

  sendJson(res, 200, {
    ok: true,
    authentic,
    message: authentic ? 'File is Authentic' : 'WARNING: Evidence integrity compromised!',
    evidence: sanitizeEvidence(entry),
    recalculatedHash
  });
}

function handlePreviewEvidence(res, user, evidenceId) {
  const entry = getEvidence().find((item) => item.id === evidenceId);
  if (!entry) {
    return sendJson(res, 404, { error: 'Evidence not found.' });
  }
  if (user.role === 'external_reviewer' && !user.allowedCaseIds.includes(entry.caseId)) {
    return sendJson(res, 403, { error: 'This reviewer is not authorized for the selected case.' });
  }
  if (isArchivedFolder(entry.folderId)) {
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Archived access',
      status: 'Alert',
      detail: `${entry.id} previewed from archived folder ${entry.folderName}`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
  }

  const decrypted = tryDecryptEvidence(entry);
  if (!decrypted.buffer) {
    entry.status = 'Tampered';
    entry.tamperDetectedAt = new Date().toISOString();
    const evidence = getEvidence().map((item) => (item.id === entry.id ? entry : item));
    writeJson(EVIDENCE_INDEX_PATH, evidence);
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Access',
      status: 'Alert',
      detail: `${entry.id} preview blocked: ${decrypted.error}`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
    return sendJson(res, 409, { error: 'Evidence cannot be previewed because integrity is compromised.' });
  }

  const buffer = decrypted.buffer;
  const isImage = entry.fileType.startsWith('image/');
  const isText = /^text\/|json|xml|javascript/.test(entry.fileType);

  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Access',
    status: 'Success',
    detail: `${entry.id} previewed`,
    evidenceId: entry.id,
    ipAddress: 'session'
  });

  if (isImage) {
    return sendJson(res, 200, {
      type: 'image',
      mimeType: entry.fileType,
      fileName: entry.fileName,
      dataUrl: `data:${entry.fileType};base64,${buffer.toString('base64')}`
    });
  }

  if (isText) {
    return sendJson(res, 200, {
      type: 'text',
      fileName: entry.fileName,
      content: buffer.toString('utf8').slice(0, 4000)
    });
  }

  return sendJson(res, 200, {
    type: 'binary',
    fileName: entry.fileName,
    content: 'Preview unavailable for this evidence type. Use the read-only download action.'
  });
}

function handleDownloadEvidence(res, user, evidenceId) {
  const entry = getEvidence().find((item) => item.id === evidenceId);
  if (!entry) {
    return sendJson(res, 404, { error: 'Evidence not found.' });
  }
  const accessRestriction = canDownloadEvidence(user, entry);
  if (!accessRestriction.ok) {
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Download',
      status: 'Failed',
      detail: `${entry.id} download blocked: ${accessRestriction.error}`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
    return sendJson(res, 403, { error: accessRestriction.error });
  }
  if (isArchivedFolder(entry.folderId)) {
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Archived access',
      status: 'Alert',
      detail: `${entry.id} downloaded from archived folder ${entry.folderName}`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
  }
  const decrypted = tryDecryptEvidence(entry);
  if (!decrypted.buffer) {
    entry.status = 'Tampered';
    entry.tamperDetectedAt = new Date().toISOString();
    const evidence = getEvidence().map((item) => (item.id === entry.id ? entry : item));
    writeJson(EVIDENCE_INDEX_PATH, evidence);
    appendAuditLog({
      user: user.displayName,
      role: user.role,
      action: 'Access',
      status: 'Alert',
      detail: `${entry.id} download blocked: ${decrypted.error}`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
    return sendJson(res, 409, { error: 'Evidence cannot be downloaded because integrity is compromised.' });
  }

  const buffer = decrypted.buffer;
  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Access',
    status: 'Success',
    detail: `${entry.id} downloaded read-only`,
    evidenceId: entry.id,
    ipAddress: 'session'
  });

  res.writeHead(200, {
    'Content-Type': entry.fileType,
    'Content-Disposition': `attachment; filename="${sanitizeDownloadName(entry.fileName)}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(buffer);
}

async function handleDeleteEvidence(req, res, user, evidenceId) {
  const evidence = getEvidence();
  const entry = evidence.find((item) => item.id === evidenceId);
  if (!entry) {
    return sendJson(res, 404, { error: 'Evidence not found.' });
  }

  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Delete',
    status: 'Failed',
    detail: `${entry.id} direct delete blocked - approval workflow required`,
    evidenceId: entry.id,
    ipAddress: getIp(req)
  });

  return sendJson(res, 403, {
    error: 'Evidence deletion requires Admin and Supervisor approval through the review workflow.'
  });
}

async function handleCreateApprovalRequest(req, res, actor) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const type = String(body.type || '').trim();
  const targetId = String(body.targetId || '').trim();
  const note = String(body.note || '').trim();
  if (!type || !targetId) {
    return sendJson(res, 400, { error: 'Approval type and target are required.' });
  }

  const approval = {
    id: crypto.randomUUID(),
    type,
    targetId,
    targetLabel: resolveApprovalTargetLabel(type, targetId),
    note,
    requestedById: actor.id,
    requestedBy: actor.displayName,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    decisionNote: '',
    requiredRoles: type === 'delete_evidence' ? ['admin', 'supervisor'] : [],
    roleApprovals: {}
  };

  if (!approval.targetLabel) {
    return sendJson(res, 404, { error: 'Approval target was not found.' });
  }

  const approvals = getApprovals();
  const existingPending = approvals.find((entry) => entry.type === type && entry.targetId === targetId && entry.status === 'pending');
  if (existingPending) {
    return sendJson(res, 409, { error: 'A pending approval request already exists for this action.' });
  }
  approvals.unshift(approval);
  saveApprovals(approvals);

  appendAuditLog({
    user: actor.displayName,
    role: actor.role,
    action: 'Approval request',
    status: 'Success',
    detail: `${type} requested for ${approval.targetLabel}`,
    ipAddress: 'session'
  });

  sendJson(res, 201, { ok: true, approval });
}

async function handleApprovalDecision(req, res, actor, approvalId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const decision = String(body.decision || '').trim().toLowerCase();
  const note = String(body.note || '').trim();
  if (!['approved', 'rejected'].includes(decision)) {
    return sendJson(res, 400, { error: 'Decision must be approved or rejected.' });
  }

  const approvals = getApprovals();
  const approval = approvals.find((entry) => entry.id === approvalId);
  if (!approval) {
    return sendJson(res, 404, { error: 'Approval request not found.' });
  }
  if (approval.status !== 'pending') {
    return sendJson(res, 409, { error: 'This approval request has already been reviewed.' });
  }

  const actorRole = String(actor.role || '');
  const now = new Date().toISOString();

  if (approval.type === 'delete_evidence') {
    approval.requiredRoles = normalizeApprovalRoles(approval.requiredRoles);
    approval.roleApprovals = normalizeRoleApprovals(approval.roleApprovals);

    if (!approval.requiredRoles.includes(actorRole)) {
      return sendJson(res, 403, { error: 'This approval requires Admin and Supervisor review only.' });
    }

    if (approval.roleApprovals[actorRole]?.decision === 'approved' && decision === 'approved') {
      return sendJson(res, 409, { error: `The ${capitalize(actorRole)} role has already approved this deletion request.` });
    }

    approval.roleApprovals[actorRole] = {
      decision,
      by: actor.displayName,
      at: now,
      note
    };

    if (decision === 'rejected') {
      approval.status = 'rejected';
      approval.reviewedAt = now;
      approval.reviewedBy = actor.displayName;
      approval.decisionNote = note;
    } else {
      const requiredApproved = approval.requiredRoles.every((role) => approval.roleApprovals[role]?.decision === 'approved');
      approval.reviewedAt = now;
      approval.reviewedBy = actor.displayName;
      approval.decisionNote = note;
      if (requiredApproved) {
        approval.status = 'approved';
        executeApprovedAction(approval, actor);
      } else {
        approval.status = 'pending';
      }
    }
  } else {
    approval.status = decision;
    approval.reviewedAt = now;
    approval.reviewedBy = actor.displayName;
    approval.decisionNote = note;
    if (decision === 'approved') {
      executeApprovedAction(approval, actor);
    }
  }
  saveApprovals(approvals);

  appendAuditLog({
    user: actor.displayName,
    role: actor.role,
    action: 'Approval review',
    status: decision === 'approved' ? 'Success' : 'Failed',
    detail: `${decision} ${approval.type} for ${approval.targetLabel}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, approval });
}

async function handleCreateEvidenceComment(req, res, user, evidenceId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const entry = getEvidence().find((item) => item.id === evidenceId);
  if (!entry) {
    return sendJson(res, 404, { error: 'Evidence not found.' });
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return sendJson(res, 400, { error: 'Comment text is required.' });
  }

  const comments = getComments();
  const comment = {
    id: crypto.randomUUID(),
    evidenceId,
    caseId: entry.caseId || null,
    userId: user.id,
    user: user.displayName,
    role: user.role,
    message,
    timestamp: new Date().toISOString()
  };
  comments.unshift(comment);
  saveComments(comments);
  createMentionNotifications(comment, entry);

  appendAuditLog({
    user: user.displayName,
    role: user.role,
    action: 'Comment',
    status: 'Success',
    detail: `Comment added to ${entry.id}`,
    evidenceId: entry.id,
    ipAddress: 'session'
  });

  sendJson(res, 201, { ok: true, comment });
}

async function handleDismissNotification(req, res, user, notificationId) {
  const notifications = getNotifications();
  const notification = notifications.find((entry) => entry.id === notificationId && entry.userId === user.id);
  if (!notification) {
    return sendJson(res, 404, { error: 'Notification not found.' });
  }
  notification.readAt = new Date().toISOString();
  saveNotifications(notifications);
  sendJson(res, 200, { ok: true, notification });
}

async function handleUpdateComplianceSchedule(req, res, adminUser) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const settings = normalizeComplianceSettings({
    enabled: Boolean(body.enabled),
    cadence: String(body.cadence || 'weekly'),
    recipients: Array.isArray(body.recipients) ? body.recipients : String(body.recipients || '').split(',').map((value) => value.trim()).filter(Boolean),
    nextRunAt: body.nextRunAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  writeJson(COMPLIANCE_SETTINGS_PATH, settings);

  appendAuditLog({
    user: adminUser.displayName,
    role: adminUser.role,
    action: 'Compliance schedule',
    status: 'Success',
    detail: `Compliance reports scheduled ${settings.enabled ? settings.cadence : 'disabled'}`,
    ipAddress: 'session'
  });

  sendJson(res, 200, { ok: true, settings });
}

function buildDashboardPayload(user) {
  const evidence = getEvidence();
  const logs = getAuditLogs();
  const cases = getCases();
  const approvals = getApprovals();
  const notifications = getNotifications().filter((entry) => entry.userId === user.id && !entry.readAt);
  const compliance = getComplianceSettings();
  const recentEvidence = evidence.slice(0, 6).map(sanitizeEvidence);
  const recentLogs = logs.slice(0, 8);
  const tamperedCount = evidence.filter((item) => item.status === 'Tampered').length;
  const pendingApprovals = approvals.filter((item) => item.status === 'pending').length;
  const archivedAccessAlerts = logs.filter((item) => item.action === 'Archived access' && item.status === 'Alert').length;

  return {
    summary: {
      totalCases: cases.length,
      totalEvidence: evidence.length,
      secureEvidence: evidence.filter((item) => item.status === 'Secure').length,
      tamperedEvidence: tamperedCount,
      recentActivities: logs.length,
      evidenceLockedRate: evidence.length ? Math.round((evidence.filter((item) => item.integrityLabel === 'Integrity Locked').length / evidence.length) * 100) : 0,
      pendingApprovals,
      archivedAccessAlerts,
      unreadNotifications: notifications.length
    },
    recentEvidence,
    recentLogs,
    caseBreakdown: buildCaseBreakdown(cases, evidence),
    widgets: {
      activeThreats: [
        { label: 'Tamper alerts', value: tamperedCount },
        { label: 'Archived access alerts', value: archivedAccessAlerts }
      ],
      anomalies: [
        { label: 'Pending approvals', value: pendingApprovals },
        { label: 'Failed logins', value: logs.filter((item) => item.action === 'Login attempt' && item.status === 'Failed').length }
      ],
      reporting: [
        { label: 'Unread notifications', value: notifications.length },
        { label: 'Next compliance run', value: compliance.enabled ? new Date(compliance.nextRunAt).toLocaleDateString() : 'Disabled' }
      ]
    },
    alerts: tamperedCount
      ? [
          {
            level: 'critical',
            message: 'WARNING: Evidence integrity compromised!'
          },
          ...(archivedAccessAlerts ? [{ level: 'critical', message: 'Archived folder access attempts detected.' }] : [])
        ]
      : archivedAccessAlerts
        ? [
            {
              level: 'critical',
              message: 'Archived folder access attempts detected.'
            }
        ]
      : [
          {
            level: 'ok',
            message: 'All tracked evidence is currently integrity locked.'
          }
        ],
    user: sanitizeUser(user)
  };
}

function buildEvidenceList(user, searchParams) {
  const query = String(searchParams.get('q') || '').trim().toLowerCase();
  const statusFilter = String(searchParams.get('status') || 'all');
  const uploaderFilter = String(searchParams.get('uploader') || 'all');
  const folderFilter = String(searchParams.get('folder') || 'all');

  let records = getEvidence().map(sanitizeEvidence);

  if (user.role === 'external_reviewer') {
    records = records.filter((item) => user.allowedCaseIds.includes(item.caseId));
  }

  if (query) {
    records = records.filter((item) =>
      [
        item.id,
        item.fileName,
        item.uploadedBy,
        item.hash,
        item.folderName,
        item.caseNumber,
        item.caseTitle,
        item.metadata?.deviceSource,
        item.metadata?.incidentType,
        item.metadata?.severity,
        ...(item.metadata?.tags || [])
      ].some((field) =>
        String(field).toLowerCase().includes(query)
      )
    );
  }

  if (statusFilter !== 'all') {
    records = records.filter((item) => item.status.toLowerCase() === statusFilter.toLowerCase());
  }

  if (uploaderFilter !== 'all') {
    records = records.filter((item) => item.uploadedBy === uploaderFilter);
  }

  if (folderFilter !== 'all') {
    records = records.filter((item) => item.folderId === folderFilter);
  }

  return {
    records,
    filters: {
      uploaders: [...new Set(getEvidence().map((item) => item.uploadedBy))],
      folders: getFolders()
    }
  };
}

function buildCasePayload(user) {
  let cases = getCases().map(sanitizeCase);
  const evidence = getEvidence();
  const folders = getFolders({ includeArchived: true });
  if (user.role === 'external_reviewer') {
    cases = cases.filter((entry) => user.allowedCaseIds.includes(entry.id));
  }
  return {
    cases: cases.map((entry) => ({
      ...entry,
      linkedFolders: folders.filter((folder) => folder.caseId === entry.id).map(sanitizeFolder),
      evidenceCount: evidence.filter((item) => item.caseId === entry.id).length,
      recentActivity: buildCaseActivityFeed(entry.id).slice(0, 6)
    }))
  };
}

function buildApprovalPayload(user) {
  const approvals = getApprovals();
  return {
    approvals: approvals.filter((entry) => {
      if (canReviewApprovals(user)) return true;
      return entry.requestedById === user.id;
    })
  };
}

function buildEvidenceCommentsPayload(user, evidenceId) {
  const entry = getEvidence().find((item) => item.id === evidenceId);
  if (!entry) {
    return { comments: [] };
  }
  return {
    comments: getComments()
      .filter((comment) => comment.evidenceId === evidenceId)
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
  };
}

function buildCaseFeedPayload(user, caseId) {
  const forensicCase = getCases().find((entry) => entry.id === caseId);
  if (!forensicCase) {
    return { feed: [] };
  }
  return {
    feed: buildCaseActivityFeed(caseId)
  };
}

function buildNotificationPayload(user) {
  return {
    notifications: getNotifications()
      .filter((entry) => entry.userId === user.id)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 20)
  };
}

function buildAuditLogPayload(searchParams) {
  const query = String(searchParams.get('q') || '').trim().toLowerCase();
  const status = String(searchParams.get('status') || 'all');
  let logs = getAuditLogs();

  if (query) {
    logs = logs.filter((item) =>
      [item.user, item.action, item.detail, item.status, item.timestamp]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  if (status !== 'all') {
    logs = logs.filter((item) => item.status.toLowerCase() === status.toLowerCase());
  }

  return { logs };
}

function buildUserManagementPayload() {
  const users = getUsers()
    .filter((user) => user.role !== 'admin')
    .map(sanitizeManagedUser)
    .sort((left, right) => left.username.localeCompare(right.username));

  return { users };
}

function buildInvestigatorPayload() {
  const investigators = getUsers()
    .filter((user) => user.role === 'investigator')
    .map(sanitizeManagedUser)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return { investigators };
}

function caseReportTemplate(user, caseId) {
  const forensicCase = getCases().find((entry) => entry.id === caseId);
  if (!forensicCase) {
    return simpleReportTemplate('Case Report', 'Case not found.');
  }
  if (user.role === 'external_reviewer' && !user.allowedCaseIds.includes(caseId)) {
    return simpleReportTemplate('Case Report', 'You are not authorized to view this case report.');
  }
  const evidence = getEvidence().filter((entry) => entry.caseId === caseId);
  const comments = getComments().filter((entry) => entry.caseId === caseId);
  const feed = buildCaseActivityFeed(caseId);
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(forensicCase.caseNumber)} Report</title>
      <style>${reportStyles()}</style>
    </head>
    <body>
      <h1>${escapeHtml(APP_NAME)}</h1>
      <h2>Automated Forensic Case Report</h2>
      <p>Generated for ${escapeHtml(user.displayName)} on ${new Date().toLocaleString()}</p>
      <section>
        <h3>${escapeHtml(forensicCase.caseNumber)} | ${escapeHtml(forensicCase.title)}</h3>
        <p>Department: ${escapeHtml(forensicCase.department)} | Subject: ${escapeHtml(forensicCase.suspectName || 'N/A')}</p>
        <p>Assigned Investigators: ${escapeHtml((forensicCase.assignedInvestigatorNames || []).join(', ') || 'Unassigned')}</p>
        <p>Notes: ${escapeHtml(forensicCase.notes || 'No notes recorded')}</p>
      </section>
      <section>
        <h3>Evidence Summary</h3>
        <table>
          <thead><tr><th>ID</th><th>File</th><th>Status</th><th>Folder</th><th>Uploaded</th><th>Severity</th></tr></thead>
          <tbody>${evidence.map((entry) => `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.fileName)}</td><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(entry.folderName)}</td><td>${escapeHtml(entry.uploadedBy)}</td><td>${escapeHtml(entry.metadata?.severity || 'medium')}</td></tr>`).join('')}</tbody>
        </table>
      </section>
      <section>
        <h3>Chain Of Custody Timeline</h3>
        <table>
          <thead><tr><th>Timestamp</th><th>Action</th><th>User</th><th>Detail</th><th>Status</th></tr></thead>
          <tbody>${feed.map((item) => `<tr><td>${escapeHtml(formatReportDate(item.timestamp))}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.user)}</td><td>${escapeHtml(item.detail || '')}</td><td>${escapeHtml(item.status || '')}</td></tr>`).join('')}</tbody>
        </table>
      </section>
      <section>
        <h3>Case Commentary</h3>
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Comment</th></tr></thead>
          <tbody>${comments.map((entry) => `<tr><td>${escapeHtml(formatReportDate(entry.timestamp))}</td><td>${escapeHtml(entry.user)}</td><td>${escapeHtml(entry.message)}</td></tr>`).join('') || '<tr><td colspan="3">No comments recorded.</td></tr>'}</tbody>
        </table>
      </section>
      <script>window.onload = () => window.print();</script>
    </body>
  </html>`;
}

function evidenceCertificateTemplate(user, evidenceId) {
  const entry = getEvidence().find((item) => item.id === evidenceId);
  if (!entry) {
    return simpleReportTemplate('Integrity Certificate', 'Evidence not found.');
  }
  if (user.role === 'external_reviewer' && !user.allowedCaseIds.includes(entry.caseId)) {
    return simpleReportTemplate('Integrity Certificate', 'You are not authorized to view this certificate.');
  }
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(entry.id)} Integrity Certificate</title>
      <style>${reportStyles()}
        .certificate { border: 3px solid #123d6b; border-radius: 20px; padding: 28px; background: white; }
      </style>
    </head>
    <body>
      <div class="certificate">
        <h1>${escapeHtml(APP_NAME)}</h1>
        <h2>Forensic Integrity Certificate</h2>
        <p>Issued for ${escapeHtml(user.displayName)} on ${new Date().toLocaleString()}</p>
        <p><strong>Evidence ID:</strong> ${escapeHtml(entry.id)}</p>
        <p><strong>File Name:</strong> ${escapeHtml(entry.fileName)}</p>
        <p><strong>Case:</strong> ${escapeHtml(entry.caseNumber || 'Unlinked')} | ${escapeHtml(entry.caseTitle || 'No case linked')}</p>
        <p><strong>Original SHA-256:</strong> ${escapeHtml(entry.hash)}</p>
        <p><strong>Status:</strong> ${escapeHtml(entry.status)}</p>
        <p><strong>Integrity Label:</strong> ${escapeHtml(entry.integrityLabel)}</p>
        <p><strong>Last Verified:</strong> ${escapeHtml(entry.lastVerifiedAt ? formatReportDate(entry.lastVerifiedAt) : 'Not yet verified')}</p>
        <p><strong>Verified By:</strong> ${escapeHtml(entry.lastVerifiedBy || 'N/A')}</p>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
  </html>`;
}

function handleCaseCsvExport(res, user) {
  const cases = buildCasePayload(user).cases;
  const csv = toCsv([
    ['Case Number', 'Title', 'Department', 'Assigned Investigators', 'Evidence Count', 'Status'],
    ...cases.map((entry) => [
      entry.caseNumber,
      entry.title,
      entry.department,
      (entry.assignedInvestigatorNames || []).join('; '),
      String(entry.evidenceCount || 0),
      entry.status
    ])
  ]);
  return sendCsv(res, 'case-summaries.csv', csv);
}

function handleEvidenceCsvExport(res, user) {
  const records = buildEvidenceList(user, new URLSearchParams()).records;
  const csv = toCsv([
    ['Evidence ID', 'File Name', 'Case Number', 'Folder', 'Uploaded By', 'Status', 'Severity', 'Hash'],
    ...records.map((entry) => [
      entry.id,
      entry.fileName,
      entry.caseNumber || '',
      entry.folderName || '',
      entry.uploadedBy || '',
      entry.status || '',
      entry.metadata?.severity || '',
      entry.hash || ''
    ])
  ]);
  return sendCsv(res, 'evidence-records.csv', csv);
}

function reportTemplate(user) {
  const rows = getAuditLogs()
    .map(
      (log) => `
      <tr>
        <td>${escapeHtml(log.timestamp)}</td>
        <td>${escapeHtml(log.user)}</td>
        <td>${escapeHtml(log.action)}</td>
        <td>${escapeHtml(log.status)}</td>
        <td>${escapeHtml(log.detail || '')}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Audit Report</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f7fb; color: #112; margin: 24px; }
        h1 { margin-bottom: 4px; }
        p { color: #445; }
        table { width: 100%; border-collapse: collapse; background: white; }
        th, td { border: 1px solid #d9e1ee; padding: 10px; font-size: 12px; text-align: left; }
        th { background: #0d2342; color: white; }
      </style>
    </head>
    <body>
      <h1>${APP_NAME}</h1>
      <p>Audit report generated for ${escapeHtml(user.displayName)} on ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Status</th><th>Detail</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body>
  </html>`;
}

function simpleReportTemplate(title, message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title><style>${reportStyles()}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function reportStyles() {
  return `
    body { font-family: Arial, sans-serif; background: #f4f7fb; color: #112; margin: 24px; }
    h1, h2, h3 { margin-bottom: 8px; }
    p { color: #445; }
    section { margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; background: white; margin-top: 12px; }
    th, td { border: 1px solid #d9e1ee; padding: 10px; font-size: 12px; text-align: left; vertical-align: top; }
    th { background: #0d2342; color: white; }
  `;
}

function toCsv(rows) {
  return rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function sendCsv(res, fileName, csv) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${sanitizeDownloadName(fileName)}"`,
    'Cache-Control': 'no-store'
  });
  res.end(csv);
}

function pageTemplate({ user, role, view }) {
  const title = view === 'landing' ? APP_NAME : `${APP_NAME} | ${capitalize(view)}`;
  const config = JSON.stringify({
    role,
    view,
    user: sanitizeUser(user)
  });

  return `<!DOCTYPE html>
  <html lang="en" data-theme="dark">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <link rel="stylesheet" href="/assets/styles.css" />
    </head>
    <body>
      <div id="app"></div>
      <script>window.__APP_CONFIG__ = ${config};</script>
      <script src="/assets/app.js" defer></script>
    </body>
  </html>`;
}

function serveStatic(res, filePath) {
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'Asset not found' });
  }
  const ext = path.extname(filePath);
  const typeMap = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, {
    'Content-Type': typeMap[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(res);
}

function requireUserPage(res, user, role) {
  if (!user || user.role !== role || user.status === 'disabled') {
    res.writeHead(302, { Location: roleLoginPath(role) });
    res.end();
  }
}

function requireApiUser(res, user, role) {
  if (!user || user.status === 'disabled' || (role && user.role !== role)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return user;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const signedCookie = cookies.deims_session;
  if (!signedCookie) return null;
  const sessionId = verifySignedValue(signedCookie, getSecrets().sessionSecret);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function setSessionCookie(res, sessionId, expiresAt) {
  const signed = signValue(sessionId, getSecrets().sessionSecret);
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  res.setHeader(
    'Set-Cookie',
    `deims_session=${signed}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict`
  );
}

function signValue(value, secret) {
  const signature = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${signature}`;
}

function verifySignedValue(value, secret) {
  const [raw, signature] = String(value).split('.');
  if (!raw || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return valid ? raw : null;
}

function encryptBuffer(buffer) {
  const key = Buffer.from(getSecrets().encryptionKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    payload,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decryptEvidence(entry) {
  const key = Buffer.from(getSecrets().encryptionKey, 'hex');
  const iv = Buffer.from(entry.encryption.iv, 'hex');
  const authTag = Buffer.from(entry.encryption.authTag, 'hex');
  const encrypted = fs.readFileSync(entry.storagePath);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function tryDecryptEvidence(entry) {
  try {
    return { buffer: decryptEvidence(entry), error: null };
  } catch {
    return { buffer: null, error: 'Encrypted evidence blob failed authentication' };
  }
}

function createUser(username, displayName, role, passwordOverride = null) {
  const defaultPassword =
    role === 'admin' ? 'Admin@123'
      : role === 'supervisor' ? 'Supervisor@123'
        : role === 'external_reviewer' ? 'Reviewer@123'
          : 'Investigator@123';
  const password = passwordOverride || defaultPassword;
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: crypto.randomUUID(),
    username: String(username).toLowerCase(),
    displayName,
    role,
    status: 'active',
    allowedCaseIds: [],
    expiresAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastFailedLoginAt: null,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt)
  };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  return candidate.length === original.length && crypto.timingSafeEqual(candidate, original);
}

function getUsers() {
  return normalizeUsers(readJson(USERS_PATH, []));
}

function getUserById(id) {
  return getUsers().find((user) => user.id === id) || null;
}

function saveUsers(users) {
  writeJson(USERS_PATH, normalizeUsers(users));
}

function getEvidence() {
  return normalizeEvidenceRecords(readJson(EVIDENCE_INDEX_PATH, []));
}

function getAuditLogs() {
  return normalizeAuditLogs(readJson(AUDIT_LOG_PATH, []));
}

function getFolders(options = {}) {
  const folders = getFoldersSafe();
  return options.includeArchived ? folders : folders.filter((folder) => folder.status !== 'archived');
}

function getSecrets() {
  return readJson(SECRETS_PATH, {});
}

function getComments() {
  return normalizeComments(readJson(COMMENTS_PATH, []));
}

function saveComments(comments) {
  writeJson(COMMENTS_PATH, normalizeComments(comments));
}

function getApprovals() {
  return normalizeApprovals(readJson(APPROVALS_PATH, []));
}

function saveApprovals(approvals) {
  writeJson(APPROVALS_PATH, normalizeApprovals(approvals));
}

function getNotifications() {
  return normalizeNotifications(readJson(NOTIFICATIONS_PATH, []));
}

function saveNotifications(notifications) {
  writeJson(NOTIFICATIONS_PATH, normalizeNotifications(notifications));
}

function getComplianceSettings() {
  return normalizeComplianceSettings(readJson(COMPLIANCE_SETTINGS_PATH, defaultComplianceSettings()));
}

function appendAuditLog({ user, role, action, status, detail, evidenceId = null, ipAddress = null }) {
  const logs = getAuditLogs();
  const previousHash = logs[0]?.hash || null;
  const entry = {
    id: crypto.randomUUID(),
    user,
    role,
    action,
    status,
    detail,
    evidenceId,
    ipAddress,
    timestamp: new Date().toISOString()
  };
  entry.previousHash = previousHash;
  entry.hash = hashAuditEntry(entry);
  logs.unshift(entry);
  writeJson(AUDIT_LOG_PATH, logs.slice(0, 500));
}

function sanitizeEvidence(entry) {
  return {
    id: entry.id,
    fileName: entry.fileName,
    fileType: entry.fileType,
    fileSize: entry.fileSize,
    uploadedAt: entry.uploadedAt,
    uploadedBy: entry.uploadedBy,
    folderId: entry.folderId,
    folderName: entry.folderName,
    caseId: entry.caseId || null,
    caseNumber: entry.caseNumber || null,
    caseTitle: entry.caseTitle || null,
    hash: entry.hash,
    hashPreview: `${entry.hash.slice(0, 10)}...${entry.hash.slice(-10)}`,
    status: entry.status,
    integrityLabel: entry.integrityLabel,
    lastVerifiedAt: entry.lastVerifiedAt,
    lastVerifiedBy: entry.lastVerifiedBy,
    tamperDetectedAt: entry.tamperDetectedAt,
    metadata: {
      deviceSource: entry.metadata?.deviceSource || '',
      seizureDate: entry.metadata?.seizureDate || '',
      incidentType: entry.metadata?.incidentType || '',
      severity: entry.metadata?.severity || 'medium',
      tags: Array.isArray(entry.metadata?.tags) ? entry.metadata.tags : [],
      investigatorNotes: entry.metadata?.investigatorNotes || ''
    }
  };
}

function ensureDefaultUsers(users) {
  const defaults = [
    createUser('admin-chief', 'Admin', 'admin'),
    createUser('supervisor-lead', 'Supervisor Lead', 'supervisor'),
    createUser('investigator-01', 'Investigator', 'investigator'),
    createUser('investigator-02', 'Priya Nair', 'investigator'),
    createUser('investigator-03', 'Arjun Mehta', 'investigator'),
    createUser('investigator-04', 'Neha Kapoor', 'investigator'),
    createUser('investigator-05', 'Rohan Sen', 'investigator')
  ];

  const normalizedExisting = normalizeUsers(users);
  const existingUsernames = new Set(normalizedExisting.map((user) => user.username));
  const merged = [...normalizedExisting];
  defaults.forEach((user) => {
    if (!existingUsernames.has(user.username)) {
      merged.push(user);
    }
  });
  return normalizeUsers(merged);
}

function ensureDefaultFolders(folders) {
  const defaults = [
    { id: 'email-fraud-case', name: 'Email Fraud Case', description: 'Suspicious email threads, attachments, and phishing artifacts.', status: 'active', createdAt: new Date().toISOString(), caseId: null, caseNumber: null, caseTitle: null },
    { id: 'network-intrusion-logs', name: 'Network Intrusion Logs', description: 'Firewall exports, IDS alerts, and authentication traces.', status: 'active', createdAt: new Date().toISOString(), caseId: null, caseNumber: null, caseTitle: null },
    { id: 'malware-analysis-lab', name: 'Malware Analysis Lab', description: 'Sandbox output, memory captures, and extracted samples.', status: 'active', createdAt: new Date().toISOString(), caseId: null, caseNumber: null, caseTitle: null }
  ];
  const existing = Array.isArray(folders) ? folders : [];
  const existingIds = new Set(existing.map((folder) => folder.id));
  const merged = [...existing];
  defaults.forEach((folder) => {
    if (!existingIds.has(folder.id)) {
      merged.push(folder);
    }
  });
  return merged.map((folder) => ({
    ...folder,
    status: folder.status === 'archived' ? 'archived' : 'active',
    createdAt: folder.createdAt || new Date().toISOString(),
    caseId: folder.caseId || null,
    caseNumber: folder.caseNumber || null,
    caseTitle: folder.caseTitle || null
  }));
}

function normalizeEvidenceRecords(records) {
  const folders = getFoldersSafe();
  const cases = getCasesSafe();
  const fallbackFolder = folders[0] || { id: 'general-evidence', name: 'General Evidence' };
  return (Array.isArray(records) ? records : []).map((record) => {
    const matchedFolder = folders.find((folder) => folder.id === record.folderId) || fallbackFolder;
    const matchedCase = cases.find((entry) => entry.id === record.caseId)
      || cases.find((entry) => entry.caseNumber === record.caseNumber)
      || (matchedFolder.caseId ? cases.find((entry) => entry.id === matchedFolder.caseId) : null)
      || null;
    return {
      ...record,
      folderId: record.folderId || matchedFolder.id,
      folderName: record.folderName || matchedFolder.name,
      caseId: record.caseId || matchedCase?.id || matchedFolder.caseId || null,
      caseNumber: record.caseNumber || matchedCase?.caseNumber || matchedFolder.caseNumber || null,
      caseTitle: record.caseTitle || matchedCase?.title || matchedFolder.caseTitle || null,
      metadata: normalizeEvidenceMetadata(record.metadata)
    };
  });
}

function getFoldersSafe() {
  try {
    return ensureDefaultFolders(readJson(FOLDERS_PATH, []));
  } catch {
    return ensureDefaultFolders([]);
  }
}

function saveFolders(folders) {
  writeJson(FOLDERS_PATH, ensureDefaultFolders(folders));
}

function getCases() {
  return normalizeCases(readJson(CASES_PATH, []));
}

function getCasesSafe() {
  try {
    return normalizeCases(readJson(CASES_PATH, []));
  } catch {
    return normalizeCases([]);
  }
}

function saveCases(cases) {
  writeJson(CASES_PATH, normalizeCases(cases));
}

function sanitizeCase(forensicCase) {
  return {
    id: forensicCase.id,
    caseNumber: forensicCase.caseNumber,
    title: forensicCase.title,
    suspectName: forensicCase.suspectName,
    department: forensicCase.department,
    status: forensicCase.status,
    assignedInvestigatorIds: forensicCase.assignedInvestigatorIds || [],
    assignedInvestigatorNames: forensicCase.assignedInvestigatorNames || [],
    notes: forensicCase.notes || '',
    findings: forensicCase.findings || '',
    milestones: Array.isArray(forensicCase.milestones) ? forensicCase.milestones : [],
    createdAt: forensicCase.createdAt,
    updatedAt: forensicCase.updatedAt
  };
}

function sanitizeFolder(folder) {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    status: folder.status,
    createdAt: folder.createdAt,
    caseId: folder.caseId || null,
    caseNumber: folder.caseNumber || null,
    caseTitle: folder.caseTitle || null
  };
}

function ensureDefaultCases(cases) {
  const investigators = getUsers().filter((entry) => entry.role === 'investigator');
  const fallbackAssigneeIds = investigators.slice(0, 2).map((entry) => entry.id);
  const fallbackAssigneeNames = investigators.slice(0, 2).map((entry) => entry.displayName);
  const defaults = [
    {
      id: crypto.randomUUID(),
      caseNumber: 'CF-2026-001',
      title: 'Business Email Compromise Review',
      suspectName: 'Unknown External Sender',
      department: 'Cyber Crime Unit',
      status: 'active',
      assignedInvestigatorIds: fallbackAssigneeIds,
      assignedInvestigatorNames: fallbackAssigneeNames,
      notes: 'Track suspicious sender infrastructure, invoice spoofing artifacts, and mailbox evidence.',
      findings: '',
      milestones: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      caseNumber: 'CF-2026-002',
      title: 'Internal Network Intrusion',
      suspectName: 'Pending Attribution',
      department: 'Incident Response',
      status: 'active',
      assignedInvestigatorIds: investigators.slice(2, 4).map((entry) => entry.id),
      assignedInvestigatorNames: investigators.slice(2, 4).map((entry) => entry.displayName),
      notes: 'Correlate intrusion logs, lateral movement traces, and malware execution evidence.',
      findings: '',
      milestones: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const existing = Array.isArray(cases) ? cases : [];
  const existingNumbers = new Set(existing.map((entry) => String(entry.caseNumber || '').toUpperCase()));
  const merged = [...existing];
  defaults.forEach((entry) => {
    if (!existingNumbers.has(entry.caseNumber)) {
      merged.push(entry);
    }
  });
  return normalizeCases(merged);
}

function ensureFolderCaseDefaults(folders, cases) {
  const caseOne = cases.find((entry) => entry.caseNumber === 'CF-2026-001') || null;
  const caseTwo = cases.find((entry) => entry.caseNumber === 'CF-2026-002') || null;
  return ensureDefaultFolders(folders).map((folder) => {
    if (folder.caseId) return folder;
    if (folder.id === 'email-fraud-case' && caseOne) {
      return { ...folder, caseId: caseOne.id, caseNumber: caseOne.caseNumber, caseTitle: caseOne.title };
    }
    if ((folder.id === 'network-intrusion-logs' || folder.id === 'malware-analysis-lab') && caseTwo) {
      return { ...folder, caseId: caseTwo.id, caseNumber: caseTwo.caseNumber, caseTitle: caseTwo.title };
    }
    return folder;
  });
}

function normalizeCases(cases) {
  return (Array.isArray(cases) ? cases : []).map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    caseNumber: String(entry.caseNumber || '').trim().toUpperCase(),
    title: String(entry.title || '').trim(),
    suspectName: String(entry.suspectName || '').trim(),
    department: String(entry.department || '').trim(),
    status: entry.status === 'closed' ? 'closed' : entry.status === 'hold' ? 'hold' : 'active',
    assignedInvestigatorIds: Array.isArray(entry.assignedInvestigatorIds) ? entry.assignedInvestigatorIds.map((value) => String(value)) : [],
    assignedInvestigatorNames: Array.isArray(entry.assignedInvestigatorNames) ? entry.assignedInvestigatorNames.map((value) => String(value)) : [],
    notes: String(entry.notes || '').trim(),
    findings: String(entry.findings || '').trim(),
    milestones: Array.isArray(entry.milestones) ? entry.milestones : [],
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  })).filter((entry) => entry.caseNumber && entry.title);
}

function normalizeEvidenceMetadata(metadata) {
  return {
    deviceSource: String(metadata?.deviceSource || '').trim(),
    seizureDate: normalizeDateString(metadata?.seizureDate || ''),
    incidentType: String(metadata?.incidentType || '').trim(),
    severity: normalizeSeverity(metadata?.severity),
    tags: Array.isArray(metadata?.tags)
      ? metadata.tags.map((value) => String(value).trim()).filter(Boolean)
      : [],
    investigatorNotes: String(metadata?.investigatorNotes || '').trim()
  };
}

function slugifyFolderName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt
  };
}

function sanitizeManagedUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    allowedCaseIds: Array.isArray(user.allowedCaseIds) ? user.allowedCaseIds : [],
    expiresAt: user.expiresAt || null,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    lastFailedLoginAt: user.lastFailedLoginAt
  };
}

function normalizeUsers(users) {
  return users.map((user) => ({
    ...user,
    username: String(user.username || '').toLowerCase(),
    status: user.status === 'disabled' ? 'disabled' : 'active',
    allowedCaseIds: Array.isArray(user.allowedCaseIds) ? user.allowedCaseIds.map((value) => String(value)) : [],
    expiresAt: user.expiresAt || null,
    failedLoginAttempts: Number(user.failedLoginAttempts || 0),
    lockedUntil: user.lockedUntil || null,
    lastLoginAt: user.lastLoginAt || null,
    lastFailedLoginAt: user.lastFailedLoginAt || null
  }));
}

function isIpRateLimited(ipAddress) {
  const now = Date.now();
  const recentAttempts = (loginAttemptStore.get(ipAddress) || []).filter((timestamp) => now - timestamp < IP_WINDOW_MS);
  loginAttemptStore.set(ipAddress, recentAttempts);
  return recentAttempts.length >= MAX_IP_WINDOW_ATTEMPTS;
}

function registerIpFailure(ipAddress) {
  const now = Date.now();
  const attempts = (loginAttemptStore.get(ipAddress) || []).filter((timestamp) => now - timestamp < IP_WINDOW_MS);
  attempts.push(now);
  loginAttemptStore.set(ipAddress, attempts);
}

function clearIpFailures(ipAddress) {
  loginAttemptStore.delete(ipAddress);
}

function validatePasswordStrength(password) {
  if (password.length < 10) {
    return { ok: false, error: 'Password must be at least 10 characters long.' };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, error: 'Password must include uppercase, lowercase, number, and special character.' };
  }
  return { ok: true };
}

function generateTemporaryPassword() {
  return `Inv-${crypto.randomBytes(4).toString('hex')}!9a`;
}

function roleDashboardPath(role) {
  if (role === 'admin') return '/admin';
  if (role === 'supervisor') return '/supervisor';
  if (role === 'external_reviewer') return '/reviewer';
  return '/investigator';
}

function roleLoginPath(role) {
  if (role === 'admin') return '/login/admin';
  if (role === 'supervisor') return '/login/supervisor';
  if (role === 'external_reviewer') return '/login/reviewer';
  return '/login/investigator';
}

function isOpsUser(user) {
  return user?.role === 'admin' || user?.role === 'supervisor';
}

function canReviewApprovals(user) {
  return user?.role === 'supervisor' || user?.role === 'admin';
}

function isArchivedFolder(folderId) {
  const folder = getFolders({ includeArchived: true }).find((entry) => entry.id === folderId);
  return folder?.status === 'archived';
}

function canDownloadEvidence(user, entry) {
  if (entry.status !== 'Secure') {
    return { ok: false, error: 'Only secure evidence can be downloaded.' };
  }
  if (user.role === 'external_reviewer') {
    return { ok: false, error: 'External reviewers have preview-only access.' };
  }
  if (user.role === 'investigator') {
    const forensicCase = entry.caseId ? getCases().find((item) => item.id === entry.caseId) : null;
    const assigned = forensicCase ? forensicCase.assignedInvestigatorIds.includes(user.id) : false;
    const uploadedByUser = entry.uploaderId === user.id;
    if (!assigned && !uploadedByUser) {
      return { ok: false, error: 'Investigators can download only assigned or self-uploaded evidence.' };
    }
  }
  if (user.role === 'external_reviewer' && !user.allowedCaseIds.includes(entry.caseId)) {
    return { ok: false, error: 'This reviewer is not authorized for the selected case.' };
  }
  if (user.expiresAt && new Date(user.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'This temporary access window has expired.' };
  }
  return { ok: true };
}

function normalizeComments(comments) {
  return (Array.isArray(comments) ? comments : []).map((comment) => ({
    id: comment.id || crypto.randomUUID(),
    evidenceId: String(comment.evidenceId || ''),
    caseId: comment.caseId || null,
    userId: comment.userId || null,
    user: String(comment.user || 'Unknown'),
    role: String(comment.role || ''),
    message: String(comment.message || ''),
    timestamp: comment.timestamp || new Date().toISOString()
  })).filter((comment) => comment.evidenceId && comment.message);
}

function normalizeApprovals(approvals) {
  return (Array.isArray(approvals) ? approvals : []).map((approval) => ({
    id: approval.id || crypto.randomUUID(),
    type: String(approval.type || ''),
    targetId: String(approval.targetId || ''),
    targetLabel: String(approval.targetLabel || ''),
    note: String(approval.note || ''),
    requestedById: approval.requestedById || null,
    requestedBy: String(approval.requestedBy || 'Unknown'),
    status: approval.status === 'approved' ? 'approved' : approval.status === 'rejected' ? 'rejected' : 'pending',
    requestedAt: approval.requestedAt || new Date().toISOString(),
    reviewedAt: approval.reviewedAt || null,
    reviewedBy: approval.reviewedBy || null,
    decisionNote: String(approval.decisionNote || ''),
    requiredRoles: normalizeApprovalRoles(approval.requiredRoles || (approval.type === 'delete_evidence' ? ['admin', 'supervisor'] : [])),
    roleApprovals: normalizeRoleApprovals(approval.roleApprovals)
  })).filter((approval) => approval.type && approval.targetId);
}

function normalizeApprovalRoles(requiredRoles) {
  const normalized = Array.isArray(requiredRoles)
    ? requiredRoles.map((role) => String(role).toLowerCase()).filter((role) => role === 'admin' || role === 'supervisor')
    : [];
  return [...new Set(normalized)];
}

function normalizeRoleApprovals(roleApprovals) {
  const output = {};
  const input = roleApprovals && typeof roleApprovals === 'object' ? roleApprovals : {};
  ['admin', 'supervisor'].forEach((role) => {
    if (!input[role]) return;
    const decision = input[role].decision === 'rejected' ? 'rejected' : input[role].decision === 'approved' ? 'approved' : null;
    if (!decision) return;
    output[role] = {
      decision,
      by: String(input[role].by || ''),
      at: input[role].at || null,
      note: String(input[role].note || '')
    };
  });
  return output;
}

function normalizeNotifications(notifications) {
  return (Array.isArray(notifications) ? notifications : []).map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    userId: entry.userId || null,
    title: String(entry.title || ''),
    message: String(entry.message || ''),
    link: String(entry.link || ''),
    createdAt: entry.createdAt || new Date().toISOString(),
    readAt: entry.readAt || null
  })).filter((entry) => entry.userId && entry.title);
}

function defaultComplianceSettings() {
  return {
    enabled: false,
    cadence: 'weekly',
    recipients: ['admin-chief'],
    nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function normalizeComplianceSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    cadence: ['weekly', 'monthly'].includes(String(settings.cadence || '').toLowerCase()) ? String(settings.cadence).toLowerCase() : 'weekly',
    recipients: Array.isArray(settings.recipients) ? settings.recipients.map((value) => String(value).trim()).filter(Boolean) : ['admin-chief'],
    nextRunAt: settings.nextRunAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function resolveApprovalTargetLabel(type, targetId) {
  if (type === 'delete_evidence') {
    return getEvidence().find((item) => item.id === targetId)?.fileName || '';
  }
  if (type === 'archive_folder' || type === 'delete_folder') {
    return getFolders({ includeArchived: true }).find((item) => item.id === targetId)?.name || '';
  }
  return '';
}

function executeApprovedAction(approval, actor) {
  if (approval.type === 'archive_folder') {
    const folders = getFolders({ includeArchived: true });
    const folder = folders.find((entry) => entry.id === approval.targetId);
    if (!folder) return;
    folder.status = folder.status === 'archived' ? 'active' : 'archived';
    saveFolders(folders);
    appendAuditLog({
      user: actor.displayName,
      role: actor.role,
      action: 'Approval execution',
      status: 'Success',
      detail: `${folder.name} ${folder.status === 'archived' ? 'archived' : 'restored'} through approval`,
      ipAddress: 'session'
    });
    return;
  }
  if (approval.type === 'delete_folder') {
    const folders = getFolders({ includeArchived: true });
    const folder = folders.find((entry) => entry.id === approval.targetId);
    if (!folder) return;
    if (getEvidence().some((entry) => entry.folderId === approval.targetId)) return;
    saveFolders(folders.filter((entry) => entry.id !== approval.targetId));
    appendAuditLog({
      user: actor.displayName,
      role: actor.role,
      action: 'Approval execution',
      status: 'Success',
      detail: `Deleted folder ${folder.name} through approval`,
      ipAddress: 'session'
    });
    return;
  }
  if (approval.type === 'delete_evidence') {
    const evidence = getEvidence();
    const entry = evidence.find((item) => item.id === approval.targetId);
    if (!entry) return;
    const resolvedStoragePath = path.resolve(entry.storagePath);
    const resolvedEvidenceDir = path.resolve(EVIDENCE_DIR);
    if (resolvedStoragePath.startsWith(resolvedEvidenceDir) && fs.existsSync(resolvedStoragePath)) {
      fs.unlinkSync(resolvedStoragePath);
    }
    writeJson(EVIDENCE_INDEX_PATH, evidence.filter((item) => item.id !== approval.targetId));
    appendAuditLog({
      user: actor.displayName,
      role: actor.role,
      action: 'Approval execution',
      status: 'Success',
      detail: `Deleted evidence ${entry.id} through approval`,
      evidenceId: entry.id,
      ipAddress: 'session'
    });
  }
}

function buildCaseActivityFeed(caseId) {
  const evidenceIds = getEvidence().filter((item) => item.caseId === caseId).map((item) => item.id);
  const logs = getAuditLogs()
    .filter((item) => !item.evidenceId || evidenceIds.includes(item.evidenceId))
    .map((item) => ({
      id: item.id,
      type: 'audit',
      title: item.action,
      detail: item.detail,
      user: item.user,
      timestamp: item.timestamp,
      status: item.status
    }));
  const comments = getComments()
    .filter((item) => item.caseId === caseId)
    .map((item) => ({
      id: item.id,
      type: 'comment',
      title: 'Evidence comment',
      detail: item.message,
      user: item.user,
      timestamp: item.timestamp,
      status: 'Success'
    }));
  const approvals = getApprovals()
    .filter((item) => evidenceIds.includes(item.targetId))
    .map((item) => ({
      id: item.id,
      type: 'approval',
      title: `Approval ${item.status}`,
      detail: `${item.type} for ${item.targetLabel}`,
      user: item.requestedBy,
      timestamp: item.requestedAt,
      status: capitalize(item.status)
    }));
  return [...logs, ...comments, ...approvals].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp)).slice(0, 30);
}

function createMentionNotifications(comment, evidence) {
  const usernames = [...new Set((String(comment.message).match(/@([a-z0-9._-]{3,32})/gi) || []).map((value) => value.slice(1).toLowerCase()))];
  if (!usernames.length) return;
  const users = getUsers();
  const notifications = getNotifications();
  usernames.forEach((username) => {
    const targetUser = users.find((entry) => entry.username === username);
    if (!targetUser || targetUser.id === comment.userId) return;
    notifications.unshift({
      id: crypto.randomUUID(),
      userId: targetUser.id,
      title: 'Mention in evidence comment',
      message: `${comment.user} mentioned you on ${evidence.id}: ${comment.message.slice(0, 120)}`,
      link: `/reports/evidence/${evidence.id}/certificate`,
      createdAt: new Date().toISOString(),
      readAt: null
    });
  });
  saveNotifications(notifications.slice(0, 200));
}

function formatReportDate(value) {
  return new Date(value).toLocaleString();
}

function parseTagsHeader(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeSeverity(value) {
  const severity = String(value || '').trim().toLowerCase();
  return ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium';
}

function normalizeDateString(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function buildCaseBreakdown(cases, evidence) {
  return cases.slice(0, 5).map((entry) => ({
    caseNumber: entry.caseNumber,
    title: entry.title,
    evidenceCount: evidence.filter((item) => item.caseId === entry.id).length
  }));
}

function hashAuditEntry(entry) {
  const payload = [
    entry.previousHash || '',
    entry.id || '',
    entry.user || '',
    entry.role || '',
    entry.action || '',
    entry.status || '',
    entry.detail || '',
    entry.evidenceId || '',
    entry.ipAddress || '',
    entry.timestamp || ''
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function normalizeAuditLogs(logs) {
  const normalized = [];
  const source = Array.isArray(logs) ? logs.slice(0, 500).reverse() : [];
  source.forEach((entry) => {
    const normalizedEntry = {
      id: entry.id || crypto.randomUUID(),
      user: String(entry.user || 'Unknown'),
      role: String(entry.role || ''),
      action: String(entry.action || ''),
      status: String(entry.status || ''),
      detail: String(entry.detail || ''),
      evidenceId: entry.evidenceId || null,
      ipAddress: entry.ipAddress || null,
      timestamp: entry.timestamp || new Date().toISOString(),
      previousHash: normalized[normalized.length - 1]?.hash || null
    };
    normalizedEntry.hash = hashAuditEntry(normalizedEntry);
    normalized.push(normalizedEntry);
  });
  return normalized.reverse();
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(';').reduce((accumulator, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (!key) return accumulator;
    accumulator[key] = rest.join('=');
    return accumulator;
  }, {});
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(html);
}

async function readJsonBody(req, res) {
  const buffer = await readRawBody(req, res, 1024 * 1024);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return null;
  }
}

function readRawBody(req, res, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        sendJson(res, 413, { error: 'Request too large.' });
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

function getIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
}

function sanitizeDownloadName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
