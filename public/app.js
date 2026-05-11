const app = document.getElementById('app');
const config = window.__APP_CONFIG__ || {};

const state = {
  dashboard: null,
  evidence: [],
  auditLogs: [],
  folders: [],
  cases: [],
  users: [],
  investigators: [],
  approvals: [],
  comments: [],
  caseFeed: [],
  notifications: [],
  complianceSettings: null,
  selectedCaseId: '',
  previewHistory: [],
  lastVerification: null,
  viewerSearch: '',
  viewerZoom: 100,
  imageAnnotation: '',
  filters: {
    evidenceSearch: '',
    evidenceStatus: 'all',
    evidenceUploader: 'all',
    evidenceFolder: 'all',
    auditSearch: '',
    auditStatus: 'all'
  },
  activeSection: 'dashboard',
  selectedFolderId: '',
  preview: null,
  upload: {
    progress: 0,
    status: 'idle',
    file: null,
    folderId: '',
    caseId: '',
    deviceSource: '',
    seizureDate: '',
    incidentType: '',
    severity: 'medium',
    tags: '',
    investigatorNotes: '',
    lastHash: null,
    lastEvidenceId: null
  },
  modal: null
};

boot();

function currentRole() {
  return config.user?.role || config.role || 'investigator';
}

function isAdmin() {
  return currentRole() === 'admin';
}

function isSupervisor() {
  return currentRole() === 'supervisor';
}

function isReviewer() {
  return currentRole() === 'external_reviewer';
}

function isOps() {
  return isAdmin() || isSupervisor();
}

function isInvestigator() {
  return currentRole() === 'investigator';
}

function assignableInvestigators() {
  const source = state.investigators.length
    ? state.investigators
    : state.users.filter((user) => user.role === 'investigator');
  return source.filter((user) => user.status !== 'disabled');
}

function roleThemeClass() {
  return isOps() ? 'admin-shell' : 'investigator-shell';
}

function roleName() {
  if (isAdmin()) return 'Admin';
  if (isSupervisor()) return 'Supervisor';
  if (isReviewer()) return 'External Reviewer';
  return 'Investigator';
}

function roleSectionTitles() {
  if (isAdmin()) {
    return {
      dashboard: 'Administrative Control Center',
      cases: 'Case Management',
      upload: 'Secure Intake Oversight',
      records: 'Evidence Governance',
      folders: 'Evidence Folder Management',
      users: 'User and Reviewer Access Control',
      approvals: 'Supervisor Review Queue',
      audit: 'Compliance Audit Trail'
    };
  }
  if (isSupervisor()) {
    return {
      dashboard: 'Supervisor Review Console',
      cases: 'Case Management',
      records: 'Evidence Governance',
      approvals: 'Supervisor Review Queue',
      audit: 'Compliance Audit Trail'
    };
  }
  if (isReviewer()) {
    return {
      dashboard: 'Reviewer Workspace',
      cases: 'Assigned Review Cases',
      records: 'Evidence Review Records'
    };
  }
  return {
    dashboard: 'Investigation Operations',
    cases: 'Assigned Cases',
    upload: 'Upload & Lock Evidence',
    records: 'Case Evidence Records',
    audit: 'Field Activity Log'
  };
}

function roleNavLabels() {
  if (isAdmin()) {
    return {
      dashboard: 'Control Center',
      cases: 'Case Management',
      upload: 'Intake Oversight',
      records: 'Governance Records',
      folders: 'Folder Management',
      users: 'User Management',
      approvals: 'Approvals',
      audit: 'Compliance Logs'
    };
  }
  if (isSupervisor()) {
    return {
      dashboard: 'Supervisor Home',
      cases: 'Case Assignment',
      records: 'Evidence Review',
      approvals: 'Approvals',
      audit: 'Audit Trail'
    };
  }
  if (isReviewer()) {
    return {
      dashboard: 'Reviewer Home',
      cases: 'Review Cases',
      records: 'Review Records'
    };
  }
  return {
    dashboard: 'Case Dashboard',
    cases: 'Case Board',
    upload: 'Upload Evidence',
    records: 'Evidence Records'
  };
}

function boot() {
  const savedTheme = localStorage.getItem('deims_theme');
  if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
  }

  if (config.view === 'landing') {
    renderLanding();
    return;
  }

  if (config.view === 'login') {
    renderLogin();
    return;
  }

  state.previewHistory = getPreviewHistory();
  renderShell();
  bindGlobalShortcuts();
  loadAllData();
}

async function loadAllData() {
  try {
    const requests = [
  fetch("./data/users.json"),
  fetch("./data/cases.json"),
  fetch("./data/evidence-index.json"),
  fetch("./data/approvals.json"),

  Promise.resolve({ investigators: [] }),
  Promise.resolve({ approvals: [] }),
  Promise.resolve({ notifications: [] }),
  Promise.resolve({ settings: null })
];
    if (isAdmin()) {
      requests.push(fetchJson('/api/users'));
    }
    const [dashboard, evidence, auditLogs, foldersPayload, casesPayload, investigatorsPayload, approvalsPayload, notificationsPayload, compliancePayload, usersPayload] = await Promise.all(requests);
    state.dashboard = dashboard;
    state.evidence = evidence.records;
    state.auditLogs = auditLogs.logs;
    state.folders = foldersPayload.folders || [];
    state.cases = casesPayload.cases || [];
    state.investigators = investigatorsPayload.investigators || [];
    state.approvals = approvalsPayload.approvals || [];
    state.notifications = notificationsPayload.notifications || [];
    state.complianceSettings = compliancePayload?.settings || null;
    if (!state.upload.folderId && state.folders[0]) {
      state.upload.folderId = state.folders[0].id;
    }
    if (!state.upload.caseId && state.cases[0]) {
      state.upload.caseId = state.cases[0].id;
    }
    if (!state.selectedFolderId && state.folders[0]) {
      state.selectedFolderId = state.folders[0].id;
    }
    if (state.selectedFolderId && !state.folders.some((folder) => folder.id === state.selectedFolderId)) {
      state.selectedFolderId = state.folders[0]?.id || '';
    }
    if (!state.selectedCaseId && state.cases[0]) {
      state.selectedCaseId = state.cases[0].id;
    }
    if (state.upload.caseId && !state.cases.some((entry) => entry.id === state.upload.caseId)) {
      state.upload.caseId = state.cases[0]?.id || '';
    }
    state.users = usersPayload?.users || [];
    renderShell();
  } catch (error) {
    showModal('Session Error', error.message || 'Unable to load secure data.');
  }
}

function renderLanding() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-side landing-side">
        <div class="login-side-card">
          <p class="badge">${shieldIcon()} DEIMS Forensics</p>
          <h1>Secure access portal</h1>
          <p class="muted">Select your role to continue.</p>
          <div class="login-points">
            <div class="login-point">
              <strong>Admin access</strong>
              <span class="muted">Governance controls, user management, and compliance review</span>
            </div>
            <div class="login-point">
              <strong>Supervisor access</strong>
              <span class="muted">Approval decisions, case oversight, and anomaly review</span>
            </div>
            <div class="login-point">
              <strong>Investigator access</strong>
              <span class="muted">Evidence upload, preview, and integrity verification workflows</span>
            </div>
            <div class="login-point">
              <strong>Protected environment</strong>
              <span class="muted">Role-restricted sessions and monitored authentication events</span>
            </div>
          </div>
        </div>
      </section>
      <aside class="role-selector">
        <article class="login-auth-card">
          <div class="panel-header">
            <div>
              <p class="badge">${lockIcon()} Secure Access</p>
              <h2 class="section-title">Choose your portal</h2>
              <p class="muted">Continue to the correct sign-in page for your assigned role.</p>
            </div>
          </div>
          <div class="toolbar">
            <a class="role-card" href="/login/admin">
              <h3>Admin Portal</h3>
              <p class="muted">Access oversight tools, investigator account controls, and compliance functions.</p>
              <span class="status-pill secure">Role: Admin</span>
            </a>
            <a class="role-card" href="/login/supervisor">
              <h3>Supervisor Portal</h3>
              <p class="muted">Review approval requests, monitor threats, and manage case assignments.</p>
              <span class="status-pill secure">Role: Supervisor</span>
            </a>
            <a class="role-card" href="/login/investigator">
              <h3>Investigator Portal</h3>
              <p class="muted">Access case evidence upload, preview, download, and integrity verification tools.</p>
              <span class="status-pill secure">Role: Investigator</span>
            </a>
          </div>
          <p class="inline-note">Authorized users only.</p>
        </article>
      </aside>
    </main>
  `;
}

function renderLogin() {
  const loginRole = config.role;
  const titleMap = {
    admin: 'Admin sign in',
    supervisor: 'Supervisor sign in',
    external_reviewer: 'Reviewer sign in',
    investigator: 'Investigator sign in'
  };
  const badgeMap = {
    admin: 'Admin Login',
    supervisor: 'Supervisor Login',
    external_reviewer: 'Reviewer Login',
    investigator: 'Investigator Login'
  };
  const userPlaceholderMap = {
    admin: 'admin-chief',
    supervisor: 'supervisor-lead',
    external_reviewer: 'reviewer-abc123',
    investigator: 'investigator-01'
  };
  const passwordPlaceholderMap = {
    admin: 'Admin@123',
    supervisor: 'Supervisor@123',
    external_reviewer: 'Temporary password',
    investigator: 'Investigator@123'
  };
  app.innerHTML = `
    <main class="login-shell ${loginRole === 'investigator' || loginRole === 'external_reviewer' ? 'investigator-shell' : 'admin-shell'}">
      <section class="login-side ${loginRole === 'investigator' || loginRole === 'external_reviewer' ? 'investigator-hero' : 'admin-hero'}">
        <div class="login-side-card">
          <p class="badge">${shieldIcon()} DEIMS Forensics</p>
          <h1>${titleMap[loginRole] || 'Secure sign in'}</h1>
          <p class="muted">Secure access only.</p>
          <div class="login-points">
            <div class="login-point">
              <strong>Role restricted</strong>
              <span class="muted">${loginRole === 'admin' ? 'Administrative controls only' : loginRole === 'supervisor' ? 'Approval and oversight controls only' : loginRole === 'external_reviewer' ? 'Temporary preview-only workspace' : 'Investigation workspace only'}</span>
            </div>
            <div class="login-point">
              <strong>Protected session</strong>
              <span class="muted">Signed cookies and server-side access checks</span>
            </div>
            <div class="login-point">
              <strong>Monitored access</strong>
              <span class="muted">Failed attempts and account lockouts are recorded</span>
            </div>
          </div>
        </div>
      </section>
      <aside class="login-auth-card">
        <p class="badge">${userIcon()} ${badgeMap[loginRole] || 'Secure Login'}</p>
        <h2 class="section-title">Welcome back</h2>
        <p class="muted">Enter your credentials to continue.</p>
        <form class="login-form" id="login-form">
          <div class="field">
            <label for="username">Username</label>
            <input id="username" name="username" placeholder="${userPlaceholderMap[loginRole] || 'username'}" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="password-field">
              <input id="password" name="password" type="password" placeholder="${passwordPlaceholderMap[loginRole] || 'password'}" required />
              <button class="password-toggle" id="password-toggle" type="button" aria-label="Show password" aria-pressed="false">
                ${eyeIcon()}
              </button>
            </div>
          </div>
          <button class="primary-button" id="login-submit" type="submit">${lockIcon()} Sign In</button>
          <a class="ghost-button" href="/">Return to role selection</a>
          <p class="inline-note" id="login-note">Authorized access only. All successful and failed attempts are recorded.</p>
        </form>
      </aside>
    </main>
  `;

  document.getElementById('login-form').addEventListener('submit', onLoginSubmit);
  document.getElementById('password-toggle').addEventListener('click', togglePasswordVisibility);
}

function renderShell() {
  const navLabels = roleNavLabels();
  app.innerHTML = `
    <div class="app-layout ${roleThemeClass()}">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="badge">${isOps() ? commandIcon() : caseIcon()} ${isAdmin() ? 'Admin Command' : isSupervisor() ? 'Supervisor Review' : isReviewer() ? 'Review Access' : 'Case Operations'}</span>
          <strong>DEIMS Forensics</strong>
          <p class="muted">${roleName()} Workspace</p>
        </div>
        <nav class="sidebar-nav">
          ${navButton('dashboard', navLabels.dashboard, dashboardIcon())}
          ${navButton('cases', navLabels.cases, caseIcon())}
          ${isInvestigator() || isAdmin() ? navButton('upload', navLabels.upload, uploadIcon()) : ''}
          ${navButton('records', navLabels.records, recordsIcon())}
          ${isAdmin() ? navButton('folders', navLabels.folders, folderIcon()) : ''}
          ${isAdmin() ? navButton('users', navLabels.users, usersIcon()) : ''}
          ${isOps() ? navButton('approvals', navLabels.approvals, shieldIcon()) : ''}
          ${isOps() || isInvestigator() ? navButton('audit', navLabels.audit, auditIcon()) : ''}
          <button class="nav-link mobile-only" data-action="logout">${logoutIcon()} Logout</button>
        </nav>
        <div class="sidebar-footer">
          <button class="theme-toggle" data-action="theme">${moonIcon()} Toggle Theme</button>
          <button class="danger-button" data-action="logout">${logoutIcon()} Logout</button>
        </div>
      </aside>
      <main class="main-content">
        ${renderTopbar()}
        ${renderSection()}
      </main>
    </div>
    ${renderModal()}
  `;

  bindShellEvents();
}

function renderTopbar() {
  const sectionTitles = roleSectionTitles();
  const showAuditActions = isOps() && state.activeSection === 'audit';
  const unreadNotifications = state.notifications.filter((entry) => !entry.readAt).length;

  return `
    <header class="topbar">
      <div>
        <p class="badge">${activityIcon()} ${config.user?.displayName || 'Secure User'} | ${roleName()}</p>
        <h1>${sectionTitles[state.activeSection]}</h1>
        <p class="muted">${isOps()
          ? 'Monitor evidence governance, tamper alerts, and chain-of-custody compliance.'
          : isReviewer()
            ? 'Review assigned evidence in read-only mode with temporary, monitored access.'
            : 'Collect, lock, preview, and verify case evidence without compromising integrity.'}</p>
      </div>
      <div class="topbar-actions">
        ${showAuditActions
          ? `<a class="ghost-button" href="/audit-report" target="_blank">${pdfIcon()} Export Audit Logs</a>`
          : ''}
        ${(state.activeSection === 'cases' || state.activeSection === 'records') ? `<a class="ghost-button" href="/exports/cases.csv">${downloadIcon()} Export Case CSV</a><a class="ghost-button" href="/exports/evidence.csv">${downloadIcon()} Export Evidence CSV</a>` : ''}
        ${state.activeSection === 'records'
          ? `<button class="ghost-button" id="refresh-records">${refreshIcon()} Refresh Records</button>`
          : ''}
        <button class="ghost-button" id="open-notifications">${activityIcon()} Notifications ${unreadNotifications ? `<span class="status-pill alert">${unreadNotifications}</span>` : ''}</button>
      </div>
    </header>
  `;
}

function renderSection() {
  if (!state.dashboard) {
    return `<section class="panel-card"><p class="muted">Loading secure forensic workspace...</p></section>`;
  }
  if (isReviewer() && (state.activeSection === 'audit' || state.activeSection === 'upload' || state.activeSection === 'approvals' || state.activeSection === 'users' || state.activeSection === 'folders')) {
    state.activeSection = 'dashboard';
  }
  if (!isOps() && state.activeSection === 'approvals') {
    state.activeSection = 'dashboard';
  }
  if (!isAdmin() && state.activeSection === 'users') {
    state.activeSection = 'dashboard';
  }
  if (!isAdmin() && state.activeSection === 'folders') {
    state.activeSection = 'dashboard';
  }
  if (!isInvestigator() && !isAdmin() && state.activeSection === 'upload') {
    state.activeSection = 'dashboard';
  }
  if (state.activeSection === 'cases') return renderCasesSection();
  if (state.activeSection === 'upload') return renderUploadSection();
  if (state.activeSection === 'records') return renderRecordsSection();
  if (state.activeSection === 'folders') return renderFoldersSection();
  if (state.activeSection === 'users') return renderUsersSection();
  if (state.activeSection === 'approvals') return renderApprovalsSection();
  if (state.activeSection === 'audit') return renderAuditSection();
  return renderDashboardSection();
}

function renderDashboardSection() {
  if (isOps()) {
    return renderAdminDashboardSection();
  }
  return renderInvestigatorDashboardSection();
}

function renderCasesSection() {
  if (isOps()) {
    return renderAdminCasesSection();
  }
  return renderInvestigatorCasesSection();
}

function renderAdminCasesSection() {
  const selectedCase = state.cases.find((entry) => entry.id === state.selectedCaseId) || state.cases[0] || null;
  const investigators = assignableInvestigators();
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${caseIcon()} Case Administration</p>
            <h2 class="section-title">Case management foundation</h2>
            <p class="muted">Create real cases, assign investigators, and link folders so evidence records inherit proper case context.</p>
          </div>
        </div>
        <div class="folder-management-grid">
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Create Case</h2>
                <p class="muted">Phase 1 captures the core case record and assigned investigators.</p>
              </div>
            </div>
            <form class="toolbar" id="create-case-form">
              <div class="field">
                <label for="new-case-number">Case Number</label>
                <input id="new-case-number" name="caseNumber" placeholder="CF-2026-003" required />
              </div>
              <div class="field">
                <label for="new-case-title">Case Title</label>
                <input id="new-case-title" name="title" placeholder="Compromised Endpoint Review" required />
              </div>
              <div class="field">
                <label for="new-case-suspect">Suspect / Subject</label>
                <input id="new-case-suspect" name="suspectName" placeholder="Unknown User / Host" />
              </div>
              <div class="field">
                <label for="new-case-department">Department</label>
                <input id="new-case-department" name="department" placeholder="Incident Response" required />
              </div>
              <div class="field">
                <label for="new-case-investigators">Assigned Investigators</label>
                <select id="new-case-investigators" name="assignedInvestigatorIds" multiple>
                  ${investigators.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)} (${escapeHtml(user.username)})</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="new-case-notes">Notes</label>
                <textarea id="new-case-notes" name="notes" rows="4" placeholder="Case notes, objectives, or intake context"></textarea>
              </div>
              <button class="primary-button" type="submit">${caseIcon()} Create Case</button>
              <p class="inline-note" id="case-management-note">Use Ctrl/Cmd to select multiple investigators.</p>
            </form>
          </section>
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Link Folder To Case</h2>
                <p class="muted">Folders can be attached or detached from cases without deleting their evidence.</p>
              </div>
            </div>
            <form class="toolbar" id="assign-folder-case-form">
              <div class="field">
                <label for="assign-folder-id">Folder</label>
                <select id="assign-folder-id" name="folderId">
                  ${state.folders.map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="assign-case-id">Case</label>
                <select id="assign-case-id" name="caseId">
                  <option value="">Unlinked</option>
                  ${state.cases.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.caseNumber)} | ${escapeHtml(entry.title)}</option>`).join('')}
                </select>
              </div>
              <button class="ghost-button" type="submit">${folderIcon()} Save Folder Link</button>
            </form>
          </section>
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Allot Investigator To Case</h2>
                <p class="muted">Assign a specific investigator to the selected case without using manual text entry.</p>
              </div>
            </div>
            <form class="toolbar" id="case-allotment-form">
              <div class="field">
                <label for="allot-case-id">Case</label>
                <select id="allot-case-id" name="caseId">
                  ${state.cases.map((entry) => `<option value="${escapeHtml(entry.id)}"${selectedCase?.id === entry.id ? ' selected' : ''}>${escapeHtml(entry.caseNumber)} | ${escapeHtml(entry.title)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="allot-investigator-id">Investigator</label>
                <select id="allot-investigator-id" name="investigatorId">
                  <option value="">Select investigator</option>
                  ${investigators.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)} (${escapeHtml(user.username)})</option>`).join('')}
                </select>
              </div>
              <button class="primary-button" type="submit">${usersIcon()} Allot Investigator</button>
              <p class="inline-note" id="case-allotment-note">${selectedCase ? `Current team: ${escapeHtml((selectedCase.assignedInvestigatorNames || []).join(', ') || 'Unassigned')}` : 'Select a case to view the assigned team.'}</p>
            </form>
          </section>
        </div>
        <section class="panel-card" style="margin-top:18px">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Shared Case Activity Feed</h2>
              <p class="muted">${selectedCase ? `${selectedCase.caseNumber} | ${selectedCase.title}` : 'Select a case to inspect activity.'}</p>
            </div>
          </div>
          <div class="split-actions" style="margin-bottom:14px">
            ${state.cases.map((entry) => `<button class="ghost-button${state.selectedCaseId === entry.id ? ' active-filter' : ''}" data-open-case-feed="${entry.id}">${escapeHtml(entry.caseNumber)}</button>`).join('')}
          </div>
          <div class="timeline">
            ${(state.caseFeed.length ? state.caseFeed : selectedCase?.recentActivity || []).map(renderCaseFeedItem).join('') || `<p class="muted">No case activity recorded yet.</p>`}
          </div>
        </section>
        <div class="table-wrap" style="margin-top:18px">
          <table>
            <thead>
              <tr><th>Case</th><th>Department</th><th>Assigned Investigators</th><th>Linked Folders</th><th>Evidence</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${state.cases.map(renderCaseRow).join('') || `<tr><td colspan="6" class="muted">No cases available.</td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderInvestigatorCasesSection() {
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${caseIcon()} Case Board</p>
            <h2 class="section-title">Active investigation cases</h2>
            <p class="muted">Cases now provide the operating context behind folders and evidence records.</p>
          </div>
        </div>
        <div class="split-actions">
          ${recentFolderButtons()}
        </div>
        <div class="case-board">
          ${state.cases.map(renderCaseCard).join('') || `<p class="muted">No cases available.</p>`}
        </div>
      </article>
    </section>
  `;
}

function renderAdminDashboardSection() {
  const summary = state.dashboard.summary;
  return `
    <section class="dashboard-grid">
      ${renderNotificationCenter()}
      ${state.dashboard.alerts.map((alert) => `<div class="alert-banner ${alert.level}">${alert.level === 'critical' ? warningIcon() : shieldIcon()} <strong>${alert.message}</strong></div>`).join('')}
      <div class="metrics-grid">
        ${[
            metricCard('Active Cases', summary.totalCases, 'Case records with linked folders and evidence'),
            metricCard('Governed Evidence', summary.totalEvidence, 'Assets under administrative control'),
            metricCard('Compliance Clear', summary.secureEvidence, 'Records currently passing integrity policy'),
            metricCard('Critical Alerts', summary.tamperedEvidence, 'Escalations requiring administrative review')
          ].join('')}
      </div>
      ${renderReportingWidgets()}
      ${renderDashboardWidgets()}
      ${renderRoleSpotlight(summary)}
      <div class="two-col">
        <section class="table-card">
          <div class="table-header">
            <div>
              <h2 class="section-title">${isAdmin() ? 'Governance Watchlist' : 'Recent Case Evidence'}</h2>
              <p class="muted">${isAdmin() ? 'Latest evidence requiring oversight and integrity review.' : 'Latest uploads and integrity state for field work.'}</p>
            </div>
            <button class="ghost-button" data-jump="records">${recordsIcon()} Open Records</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>File</th><th>Hash</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${state.dashboard.recentEvidence.map(renderEvidenceRowCompact).join('') || `<tr><td colspan="4" class="muted">No evidence uploaded yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="panel-card">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">${isAdmin() ? 'Compliance Timeline' : 'Operational Timeline'}</h2>
              <p class="muted">${isAdmin() ? 'Administrative visibility into system and user actions.' : 'Last recorded investigation actions.'}</p>
            </div>
          </div>
          <div class="timeline">
            ${state.dashboard.recentLogs.map(renderTimelineItem).join('') || `<p class="muted">No audit activity yet.</p>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderInvestigatorDashboardSection() {
  const summary = state.dashboard.summary;
  const latestRecord = state.dashboard.recentEvidence[0];
  return `
    <section class="dashboard-grid">
      ${renderNotificationCenter()}
      ${state.dashboard.alerts.map((alert) => `<div class="alert-banner ${alert.level}">${alert.level === 'critical' ? warningIcon() : shieldIcon()} <strong>${alert.message}</strong></div>`).join('')}
      <section class="ops-hero">
        <article class="panel-card ops-hero-panel">
          <div class="panel-header">
            <div>
              <p class="badge">${caseIcon()} Active Case Operations</p>
              <h2 class="panel-title">Investigator quick workflow</h2>
              <p class="muted">Start with evidence intake, then move through preview and authenticity verification without leaving the field workspace.</p>
            </div>
            <button class="primary-button" data-jump="upload">${uploadIcon()} Upload New Evidence</button>
          </div>
          <div class="ops-strip">
            <div class="mini-stat"><strong>${summary.totalEvidence}</strong><span class="muted">Case files available</span></div>
            <div class="mini-stat"><strong>${summary.secureEvidence}</strong><span class="muted">Authentic evidence records</span></div>
            <div class="mini-stat"><strong>${summary.tamperedEvidence}</strong><span class="muted">Warnings needing re-check</span></div>
          </div>
        </article>
      </section>
      <div class="metrics-grid investigator-metrics">
        ${[
            metricCard('Active Cases', summary.totalCases, 'Investigation cases available in the workspace'),
            metricCard('Case Evidence', summary.totalEvidence, 'Tracked across active investigations'),
            metricCard('Authentic Files', summary.secureEvidence, 'Ready for courtroom-grade review'),
            metricCard('Tamper Alerts', summary.tamperedEvidence, 'Immediate field warning state')
          ].join('')}
      </div>
      ${renderDashboardWidgets()}
      <div class="investigator-grid">
        <section class="panel-card">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Current Case Focus</h2>
              <p class="muted">Fast access to the most recent evidence item and its integrity state.</p>
            </div>
            <button class="ghost-button" data-jump="records">${recordsIcon()} Open Case Records</button>
          </div>
          ${latestRecord ? `
            <div class="case-focus-card ${latestRecord.status.toLowerCase() === 'tampered' ? 'case-focus-alert' : ''}">
              <strong>${escapeHtml(latestRecord.fileName)}</strong>
              <div class="inline-note">${escapeHtml(latestRecord.id)} | ${formatDate(latestRecord.uploadedAt)}</div>
              <div class="split-actions" style="margin-top:12px">
                <span class="status-pill ${latestRecord.status.toLowerCase()}">${statusDot(latestRecord.status)} ${escapeHtml(latestRecord.status)}</span>
                <span class="hash-pill">${escapeHtml(latestRecord.hashPreview)}</span>
              </div>
              <div class="split-actions" style="margin-top:14px">
                <button class="ghost-button" data-preview="${latestRecord.id}">${previewIcon()} Preview</button>
                <button class="ghost-button" data-verify="${latestRecord.id}">${shieldIcon()} Verify Integrity</button>
              </div>
            </div>
          ` : `<p class="muted">No evidence uploaded yet. Start by adding a document, image, or log file.</p>`}
        </section>
        <section class="panel-card">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Recent Field Actions</h2>
              <p class="muted">Investigator-focused timeline of uploads, previews, and verification work.</p>
            </div>
          </div>
          <div class="timeline">
            ${state.dashboard.recentLogs.slice(0, 5).map(renderTimelineItem).join('') || `<p class="muted">No activity logged yet.</p>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderUploadSection() {
  if (isAdmin()) {
    return renderAdminUploadSection();
  }
  return renderInvestigatorUploadSection();
}

function renderAdminUploadSection() {
  const progressText = state.upload.status === 'uploading'
    ? `Uploading securely... ${state.upload.progress}%`
    : state.upload.status === 'done'
      ? `Evidence locked with SHA-256. File ID: ${state.upload.lastEvidenceId}`
      : 'Select a document, image, or log file to lock its integrity.';

  return `
    <section class="upload-grid">
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${isAdmin() ? 'Administrative Intake Review' : 'Case Evidence Intake'}</h2>
            <p class="muted">${isAdmin()
              ? 'Authorize secure intake, maintain custody metadata, and confirm integrity locking for stored evidence.'
              : 'Submit case files securely. Each upload is encrypted at rest and receives a unique evidence ID plus SHA-256 fingerprint.'}</p>
          </div>
        </div>
        <div class="field" style="margin-bottom:16px">
          <label for="upload-case">Case</label>
          <select id="upload-case">${renderCaseOptions(state.upload.caseId)}</select>
        </div>
        <div class="field" style="margin-bottom:16px">
          <label for="upload-folder">Evidence Folder</label>
          <select id="upload-folder">${renderFolderOptions(state.upload.folderId)}</select>
        </div>
        ${renderUploadMetadataFields()}
        <div class="dropzone">
          <div>
            <div class="badge">${uploadIcon()} Secure Intake</div>
            <h3>Drop file or choose from device</h3>
            <p class="muted">Supported: documents, images, logs. Maximum size: 25 MB.</p>
            <input id="file-input" type="file" />
          </div>
        </div>
        <div class="toolbar" style="margin-top:16px">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${state.upload.progress}%"></div>
          </div>
          <p class="inline-note">${progressText}</p>
          <button class="primary-button" id="upload-button"${state.upload.status === 'uploading' ? ' disabled' : ''}>${lockIcon()} Upload & Lock Integrity</button>
        </div>
      </article>
      <article class="preview-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${isAdmin() ? 'Governance Snapshot' : 'Integrity Snapshot'}</h2>
            <p class="muted">${isAdmin() ? 'Immediate administrative view of intake identifiers and locked hash state.' : 'Immediate evidence fingerprinting after upload.'}</p>
          </div>
        </div>
        <div class="toolbar">
          <div class="mini-stat">
            <strong>${state.upload.lastEvidenceId || 'Pending'}</strong>
            <span class="muted">Unique file ID</span>
          </div>
          <div class="mini-stat">
            <strong>Integrity Locked</strong>
            <span class="muted">Status after successful upload</span>
          </div>
          <div class="field">
            <label>SHA-256 Hash</label>
            <textarea rows="6" readonly>${state.upload.lastHash || 'Hash will appear here after secure upload.'}</textarea>
          </div>
        </div>
      </article>
    </section>
  `;
}

function renderInvestigatorUploadSection() {
  const progressText = state.upload.status === 'uploading'
    ? `Uploading securely... ${state.upload.progress}%`
    : state.upload.status === 'done'
      ? `Evidence locked with SHA-256. File ID: ${state.upload.lastEvidenceId}`
      : 'Choose a case file to generate its forensic fingerprint.';

  return `
    <section class="dashboard-grid">
      <section class="investigator-grid">
        <article class="panel-card">
          <div class="panel-header">
            <div>
              <p class="badge">${uploadIcon()} Case Intake</p>
              <h2 class="panel-title">Submit investigation evidence</h2>
              <p class="muted">Designed for investigators to move from intake to hash lock in one uninterrupted flow.</p>
            </div>
          </div>
          <div class="field" style="margin-bottom:16px">
            <label for="upload-case">Case</label>
            <select id="upload-case">${renderCaseOptions(state.upload.caseId)}</select>
          </div>
          <div class="field" style="margin-bottom:16px">
            <label for="upload-folder">Evidence Folder</label>
            <select id="upload-folder">${renderFolderOptions(state.upload.folderId)}</select>
          </div>
          ${renderUploadMetadataFields()}
          <div class="dropzone">
            <div>
              <h3>Upload a case artifact</h3>
              <p class="muted">Documents, screenshots, malware samples, logs, and forensic exports up to 25 MB.</p>
              <input id="file-input" type="file" />
            </div>
          </div>
          <div class="toolbar" style="margin-top:16px">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${state.upload.progress}%"></div>
            </div>
            <p class="inline-note">${progressText}</p>
            <button class="primary-button" id="upload-button"${state.upload.status === 'uploading' ? ' disabled' : ''}>${lockIcon()} Upload & Lock Integrity</button>
          </div>
        </article>
        <article class="preview-card">
          <div class="panel-header">
            <div>
              <p class="badge">${shieldIcon()} Chain Of Custody</p>
              <h2 class="panel-title">Immediate lock summary</h2>
              <p class="muted">Every successful upload gets a unique ID and stored SHA-256 fingerprint.</p>
            </div>
          </div>
          <div class="role-grid">
            <div class="mini-stat">
              <strong>${state.upload.lastEvidenceId || 'Pending'}</strong>
              <span class="muted">Evidence ID</span>
            </div>
            <div class="mini-stat">
              <strong>Integrity Locked</strong>
              <span class="muted">Forensic status</span>
            </div>
            <div class="mini-stat">
              <strong>Encrypted</strong>
              <span class="muted">Stored at rest</span>
            </div>
          </div>
          <div class="field" style="margin-top:16px">
            <label>SHA-256 Hash</label>
            <textarea rows="8" readonly>${state.upload.lastHash || 'Hash will appear here after secure upload.'}</textarea>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderUploadMetadataFields() {
  return `
    <div class="folder-view-grid" style="margin-bottom:16px">
      <div class="field">
        <label for="upload-device-source">Device / Source</label>
        <input id="upload-device-source" value="${escapeHtml(state.upload.deviceSource)}" placeholder="Laptop image, mailbox export, firewall appliance" />
      </div>
      <div class="field">
        <label for="upload-seizure-date">Seizure Date</label>
        <input id="upload-seizure-date" type="date" value="${escapeHtml(state.upload.seizureDate)}" />
      </div>
      <div class="field">
        <label for="upload-incident-type">Incident Type</label>
        <input id="upload-incident-type" value="${escapeHtml(state.upload.incidentType)}" placeholder="Phishing, malware, insider access" />
      </div>
      <div class="field">
        <label for="upload-severity">Severity</label>
        <select id="upload-severity">${renderOptions(['low', 'medium', 'high', 'critical'], state.upload.severity)}</select>
      </div>
      <div class="field">
        <label for="upload-tags">Tags</label>
        <input id="upload-tags" value="${escapeHtml(state.upload.tags)}" placeholder="invoice fraud, mailbox, finance" />
      </div>
      <div class="field">
        <label for="upload-notes">Investigator Notes</label>
        <textarea id="upload-notes" rows="4" placeholder="Intake notes or custody observations">${escapeHtml(state.upload.investigatorNotes)}</textarea>
      </div>
    </div>
  `;
}

function renderUsersSection() {
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${usersIcon()} Access Administration</p>
            <h2 class="section-title">Investigator account management</h2>
            <p class="muted">Create investigator accounts, disable or re-enable access, and issue temporary password resets.</p>
          </div>
        </div>
        <div class="user-management-grid">
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Create Investigator</h2>
                <p class="muted">Provision a new investigator with a strong initial password.</p>
              </div>
            </div>
            <form class="toolbar" id="create-user-form">
              <div class="field">
                <label for="new-display-name">Display Name</label>
                <input id="new-display-name" name="displayName" placeholder="Aarav Sharma" required />
              </div>
              <div class="field">
                <label for="new-username">Username</label>
                <input id="new-username" name="username" placeholder="aarav.sharma" required />
              </div>
              <div class="field">
                <label for="new-password">Initial Password</label>
                <input id="new-password" name="password" type="password" placeholder="Use a strong password" required />
              </div>
              <button class="primary-button" type="submit">${usersIcon()} Create Investigator</button>
              <p class="inline-note" id="user-management-note">Passwords must be at least 10 characters and include upper, lower, number, and special character.</p>
            </form>
            <form class="toolbar" id="create-reviewer-form" style="margin-top:18px">
              <div class="field">
                <label for="reviewer-display-name">Temporary Reviewer Name</label>
                <input id="reviewer-display-name" name="displayName" placeholder="Legal Reviewer" required />
              </div>
              <div class="field">
                <label for="reviewer-case-id">Allowed Case</label>
                <select id="reviewer-case-id" name="caseId">${renderCaseOptions(state.cases[0]?.id || '')}</select>
              </div>
              <div class="field">
                <label for="reviewer-expiry">Access Window (hours)</label>
                <input id="reviewer-expiry" name="expiresInHours" type="number" min="1" max="72" value="24" required />
              </div>
              <button class="ghost-button" type="submit">${shieldIcon()} Create Temporary Reviewer</button>
            </form>
          </section>
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Managed Users</h2>
                <p class="muted">Investigators, supervisors, and temporary reviewers are visible here.</p>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>User</th><th>Role</th><th>Status</th><th>Last Login</th><th>Failed Attempts</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  ${state.users.map(renderManagedUserRow).join('') || `<tr><td colspan="6" class="muted">No managed accounts found.</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </article>
    </section>
  `;
}

function renderFoldersSection() {
  const selectedFolder = state.folders.find((folder) => folder.id === state.selectedFolderId) || state.folders[0] || null;
  const folderEvidence = selectedFolder
    ? state.evidence.filter((entry) => entry.folderId === selectedFolder.id)
    : [];
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${folderIcon()} Folder Administration</p>
            <h2 class="section-title">Evidence folder management</h2>
            <p class="muted">Create folders for new investigations, rename them safely, archive inactive folders, or delete empty folders.</p>
          </div>
        </div>
        <div class="folder-management-grid">
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Create Folder</h2>
                <p class="muted">New folders become available immediately for evidence intake.</p>
              </div>
            </div>
            <form class="toolbar" id="create-folder-form">
              <div class="field">
                <label for="new-folder-name">Folder Name</label>
                <input id="new-folder-name" name="name" placeholder="Mobile Device Extraction" required />
              </div>
              <div class="field">
                <label for="new-folder-case">Linked Case</label>
                <select id="new-folder-case" name="caseId">
                  <option value="">Unlinked</option>
                  ${state.cases.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.caseNumber)} | ${escapeHtml(entry.title)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="new-folder-description">Description</label>
                <textarea id="new-folder-description" name="description" rows="4" placeholder="Short case or evidence category description"></textarea>
              </div>
              <button class="primary-button" type="submit">${folderIcon()} Create Folder</button>
              <p class="inline-note" id="folder-management-note">Archived folders stay visible to Admins but are hidden from normal upload selection.</p>
            </form>
          </section>
          <section class="panel-card">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Existing Folders</h2>
                <p class="muted">Delete is only allowed when a folder has no evidence records.</p>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Folder</th><th>Linked Case</th><th>Status</th><th>Evidence Count</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  ${state.folders.map(renderFolderRow).join('') || `<tr><td colspan="5" class="muted">No folders found.</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <section class="panel-card" style="margin-top:18px">
          <div class="panel-header">
            <div>
              <p class="badge">${folderIcon()} Folder View</p>
              <h2 class="panel-title">${selectedFolder ? escapeHtml(selectedFolder.name) : 'No folder selected'}</h2>
              <p class="muted">${selectedFolder ? escapeHtml(selectedFolder.description || 'No description available.') : 'Select a folder to inspect its evidence and documentation.'}</p>
              ${selectedFolder?.caseNumber ? `<p class="inline-note">Linked case: ${escapeHtml(selectedFolder.caseNumber)} | ${escapeHtml(selectedFolder.caseTitle || '')}</p>` : '<p class="inline-note">No case linked to this folder yet.</p>'}
            </div>
          </div>
          ${selectedFolder ? `
            <div class="folder-view-grid">
              <div class="mini-stat">
                <strong>${folderEvidence.length}</strong>
                <span class="muted">Evidence and documentation items</span>
              </div>
              <div class="mini-stat">
                <strong>${escapeHtml(selectedFolder.status)}</strong>
                <span class="muted">Folder status</span>
              </div>
              <div class="mini-stat">
                <strong>${selectedFolder.createdAt ? formatDate(selectedFolder.createdAt) : 'N/A'}</strong>
                <span class="muted">Created</span>
              </div>
            </div>
            <div class="table-wrap" style="margin-top:18px">
              <table>
                <thead>
                  <tr><th>Evidence / Document</th><th>Type</th><th>Uploaded By</th><th>Uploaded</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${folderEvidence.map(renderFolderEvidenceRow).join('') || `<tr><td colspan="5" class="muted">No evidence or documentation stored in this folder.</td></tr>`}
                </tbody>
              </table>
            </div>
          ` : `<p class="muted">No folder selected.</p>`}
        </section>
      </article>
    </section>
  `;
}

function renderRecordsSection() {
  if (isAdmin()) {
    return renderAdminRecordsSection();
  }
  return renderInvestigatorRecordsSection();
}

function renderAdminRecordsSection() {
  const uploaders = [...new Set(state.evidence.map((entry) => entry.uploadedBy))];
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">${isAdmin() ? 'Evidence Governance Registry' : 'Case Evidence Registry'}</h2>
            <p class="muted">${isAdmin()
              ? 'Review chain-of-custody records, inspect tamper status, and oversee secure evidence access.'
              : 'Search, filter, verify, preview, and download evidence in read-only mode.'}</p>
          </div>
        </div>
        <div class="search-row">
          <div class="field">
            <label>Search</label>
            <input id="evidence-search" value="${escapeHtml(state.filters.evidenceSearch)}" placeholder="Search by ID, file name, uploader, or hash" />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="evidence-status">
              ${renderOptions(['all', 'secure', 'tampered'], state.filters.evidenceStatus)}
            </select>
          </div>
          <div class="field">
            <label>Uploaded By</label>
            <select id="evidence-uploader">
              ${renderOptions(['all', ...uploaders], state.filters.evidenceUploader)}
            </select>
          </div>
          <div class="field">
            <label>Folder</label>
            <select id="evidence-folder">
              <option value="all"${state.filters.evidenceFolder === 'all' ? ' selected' : ''}>All</option>
              ${renderFolderOptions(state.filters.evidenceFolder)}
            </select>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="ghost-button" id="apply-evidence-filters">${filterIcon()} Apply Filters</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Case</th>
                <th>Folder</th>
                <th>Upload Date</th>
                <th>Uploaded By</th>
                <th>Hash Preview</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.evidence.map(renderEvidenceRowFull).join('') || `<tr><td colspan="8" class="muted">No evidence records found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
      <article class="preview-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${isAdmin() ? 'Administrative Preview' : 'File Preview'}</h2>
            <p class="muted">${isAdmin() ? 'Governance-only read access for supported file types.' : 'Read-only access for supported file types.'}</p>
          </div>
        </div>
        ${renderPreviewPanel()}
      </article>
    </section>
  `;
}

function renderInvestigatorRecordsSection() {
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${recordsIcon()} Case Workspace</p>
            <h2 class="section-title">Investigator evidence board</h2>
            <p class="muted">A case-first layout for search, preview, download, and on-demand integrity verification.</p>
          </div>
        </div>
        <div class="investigator-records-grid">
          <div class="field">
            <label>Search Evidence</label>
            <input id="evidence-search" value="${escapeHtml(state.filters.evidenceSearch)}" placeholder="Search by file name, ID, or hash" />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="evidence-status">
              ${renderOptions(['all', 'secure', 'tampered'], state.filters.evidenceStatus)}
            </select>
          </div>
          <div class="field">
            <label>Folder</label>
            <select id="evidence-folder">
              <option value="all"${state.filters.evidenceFolder === 'all' ? ' selected' : ''}>All</option>
              ${renderFolderOptions(state.filters.evidenceFolder)}
            </select>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="ghost-button" id="apply-evidence-filters">${filterIcon()} Filter Board</button>
          </div>
        </div>
        <div class="case-board">
          ${state.evidence.map(renderInvestigatorCaseCard).join('') || `<p class="muted">No evidence records found.</p>`}
        </div>
      </article>
      <article class="preview-card">
        <div class="panel-header">
          <div>
            <p class="badge">${previewIcon()} Read-Only Preview</p>
            <h2 class="panel-title">Selected evidence preview</h2>
            <p class="muted">Open any evidence card to inspect supported content without altering the stored artifact.</p>
          </div>
        </div>
        ${renderPreviewPanel()}
      </article>
    </section>
  `;
}

function renderAuditSection() {
  if (isOps()) {
    return renderAdminAuditSection();
  }
  return renderInvestigatorAuditSection();
}

function renderApprovalsSection() {
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <p class="badge">${shieldIcon()} Supervisor Workflow</p>
            <h2 class="section-title">Approval queue</h2>
            <p class="muted">Destructive actions now move through a review flow before execution.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Type</th><th>Target</th><th>Requested By</th><th>Status</th><th>Requested</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${state.approvals.map(renderApprovalRow).join('') || `<tr><td colspan="6" class="muted">No approval requests found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderAdminAuditSection() {
  return `
    <section class="dashboard-grid">
      <article class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">${isAdmin() ? 'Compliance Audit Dashboard' : 'Investigation Activity Dashboard'}</h2>
            <p class="muted">${isAdmin()
              ? 'Every upload, access, verification, and failed attempt is recorded for governance and review.'
              : 'Every upload, access, verification, and failed attempt is recorded in the forensic trail.'}</p>
          </div>
          <a class="ghost-button" href="/audit-report" target="_blank">${pdfIcon()} Export as PDF</a>
        </div>
        <div class="search-row">
          <div class="field">
            <label>Search</label>
            <input id="audit-search" value="${escapeHtml(state.filters.auditSearch)}" placeholder="Search by user, action, status, or timestamp" />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="audit-status">
              ${renderOptions(['all', 'success', 'failed', 'alert'], state.filters.auditStatus)}
            </select>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="ghost-button" id="apply-audit-filters">${filterIcon()} Apply Filters</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr><th>User</th><th>Action</th><th>Timestamp</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              ${state.auditLogs.map(renderAuditRow).join('') || `<tr><td colspan="5" class="muted">No audit events found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderInvestigatorAuditSection() {
  return `
    <section class="dashboard-grid">
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <p class="badge">${auditIcon()} Investigator Activity</p>
            <h2 class="panel-title">Case activity timeline</h2>
            <p class="muted">A simpler operational view focused on recent uploads, previews, and verification events.</p>
          </div>
        </div>
        <div class="investigator-records-grid">
          <div class="field">
            <label>Search Activity</label>
            <input id="audit-search" value="${escapeHtml(state.filters.auditSearch)}" placeholder="Search timeline" />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="audit-status">
              ${renderOptions(['all', 'success', 'failed', 'alert'], state.filters.auditStatus)}
            </select>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="ghost-button" id="apply-audit-filters">${filterIcon()} Filter Timeline</button>
          </div>
        </div>
        <div class="timeline" style="margin-top:16px">
          ${state.auditLogs.map(renderTimelineItem).join('') || `<p class="muted">No audit events found.</p>`}
        </div>
      </article>
    </section>
  `;
}

function renderPreviewPanel() {
  if (!state.preview) {
    return `<p class="muted">Select Preview on any evidence record to inspect supported file content here.</p>`;
  }
  const selectedEvidence = state.evidence.find((item) => item.id === state.preview.evidenceId) || null;
  const viewerBody = renderAdvancedViewer(selectedEvidence);
  const historyBlock = `
    <div class="panel-card" style="margin-top:16px">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Preview History</h3>
          <p class="muted">Recently opened evidence in this workspace session.</p>
        </div>
      </div>
      <div class="timeline" style="margin-top:12px">
        ${state.previewHistory.map(renderPreviewHistoryItem).join('') || `<p class="muted">No preview history yet.</p>`}
      </div>
    </div>
  `;
  const commentsBlock = `
    <div class="panel-card" style="margin-top:16px">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Evidence Comments</h3>
          <p class="muted">Shared operational notes for this evidence item.</p>
        </div>
      </div>
      ${!isReviewer() ? `
        <form class="toolbar" id="comment-form">
          <div class="field">
            <label for="comment-input">New Comment</label>
            <textarea id="comment-input" rows="3" placeholder="Add investigative context or review notes"></textarea>
          </div>
          <button class="ghost-button" type="submit">${activityIcon()} Add Comment</button>
        </form>
      ` : ''}
      <div class="timeline" style="margin-top:12px">
        ${state.comments.map(renderCommentItem).join('') || `<p class="muted">No comments recorded yet.</p>`}
      </div>
    </div>
  `;
  return `${renderQuickActions(selectedEvidence)}${viewerBody}${renderVerificationComparison(selectedEvidence)}${renderCertificateActions(selectedEvidence)}${renderRelationshipMap(selectedEvidence)}${historyBlock}${commentsBlock}`;
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.kind === 'delete-confirm') {
    const target = state.modal.target;
    const currentValue = state.modal.inputValue || '';
    const matches = currentValue === target.id;
    return `
      <div class="modal-backdrop" id="modal-close">
        <div class="modal">
          <p class="badge">${warningIcon()} Delete Confirmation</p>
          <h3>${escapeHtml(state.modal.title)}</h3>
          <p>${escapeHtml(state.modal.message)}</p>
          <div class="field" style="margin:16px 0">
            <label for="delete-confirm-input">Type the evidence ID to confirm deletion</label>
            <input id="delete-confirm-input" value="${escapeHtml(currentValue)}" placeholder="${escapeHtml(target.id)}" autocomplete="off" />
          </div>
          <p class="inline-note">Required: <strong>${escapeHtml(target.id)}</strong></p>
          <div class="split-actions" style="margin-top:16px">
            <button class="ghost-button" id="modal-cancel" type="button">Cancel</button>
            <button class="danger-button" id="modal-confirm-delete" type="button"${matches ? '' : ' disabled'}>${trashIcon()} Delete Evidence</button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="modal-backdrop" id="modal-close">
      <div class="modal">
        <p class="badge">${warningIcon()} Security Alert</p>
        <h3>${escapeHtml(state.modal.title)}</h3>
        <p>${escapeHtml(state.modal.message)}</p>
        <div class="split-actions">
          <button class="primary-button" id="modal-ok">Acknowledge</button>
        </div>
      </div>
    </div>
  `;
}

function renderQuickActions(item) {
  if (!item) return '';
  return `
    <section class="panel-card quick-actions-panel" style="margin-bottom:16px">
      <div class="panel-header">
        <div>
          <p class="badge">${activityIcon()} Quick Actions</p>
          <h3 class="panel-title">${escapeHtml(item.fileName)}</h3>
          <p class="muted">Shortcuts: V verify, P preview latest, D download, / focus viewer search.</p>
        </div>
      </div>
      <div class="split-actions">
        <button class="ghost-button" data-preview="${item.id}">${previewIcon()} Preview</button>
        <button class="ghost-button" data-verify="${item.id}">${shieldIcon()} Verify Integrity</button>
        ${!isReviewer() ? `<button class="ghost-button" data-download="${item.id}">${downloadIcon()} Download</button>` : ''}
      </div>
    </section>
  `;
}

function renderAdvancedViewer(item) {
  if (!item) return `<p class="muted">No evidence selected.</p>`;
  const searchBar = `
    <div class="viewer-toolbar">
      <div class="field">
        <label for="viewer-search">Viewer Search</label>
        <input id="viewer-search" value="${escapeHtml(state.viewerSearch)}" placeholder="Search inside preview content" />
      </div>
      ${state.preview.type === 'image' ? `
        <div class="field">
          <label for="viewer-zoom">Zoom</label>
          <input id="viewer-zoom" type="range" min="60" max="180" step="10" value="${state.viewerZoom}" />
        </div>
        <div class="field">
          <label for="viewer-annotation">Annotation</label>
          <input id="viewer-annotation" value="${escapeHtml(state.imageAnnotation)}" placeholder="Add a visual note overlay" />
        </div>
      ` : ''}
    </div>
  `;
  if (state.preview.type === 'image') {
    return `
      ${searchBar}
      <div class="image-viewer-shell">
        <div class="image-viewer-stage">
          <img alt="Evidence preview" src="${state.preview.dataUrl}" style="transform: scale(${state.viewerZoom / 100});" class="image-viewer-image" />
          ${state.imageAnnotation ? `<div class="image-annotation">${escapeHtml(state.imageAnnotation)}</div>` : ''}
        </div>
      </div>
    `;
  }

  const isLogLike = /log|trace|json|xml|plain|text/i.test(state.preview.fileName || '') || item.fileType?.includes('text');
  if (isLogLike) {
    return `
      ${searchBar}
      <div class="log-viewer-shell">
        <div class="log-viewer-header">
          <span class="status-pill secure">${statusDot('Secure')} Syntax Highlighted Log View</span>
          <span class="inline-note">${escapeHtml(item.fileType || 'text/plain')}</span>
        </div>
        <div class="log-viewer-body">${renderHighlightedLogContent(state.preview.content, state.viewerSearch)}</div>
      </div>
    `;
  }

  return `
    ${searchBar}
    <div class="document-viewer-shell">
      <div class="field">
        <label>${escapeHtml(state.preview.fileName)}</label>
        <textarea rows="16" readonly>${escapeHtml(state.preview.content)}</textarea>
      </div>
    </div>
  `;
}

function renderVerificationComparison(item) {
  if (!item || !state.lastVerification || state.lastVerification.id !== item.id) return '';
  return `
    <section class="panel-card" style="margin-top:16px">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Hash Comparison</h3>
          <p class="muted">Side-by-side original and recalculated SHA-256 values from the latest verification.</p>
        </div>
      </div>
      <div class="hash-compare-grid">
        <div class="field">
          <label>Stored Original Hash</label>
          <textarea rows="4" readonly>${escapeHtml(state.lastVerification.originalHash)}</textarea>
        </div>
        <div class="field">
          <label>Recalculated Hash</label>
          <textarea rows="4" readonly>${escapeHtml(state.lastVerification.recalculatedHash || 'Unavailable')}</textarea>
        </div>
      </div>
      <div class="inline-note">${state.lastVerification.authentic ? 'Hashes match. Evidence remains authentic.' : 'Hashes do not match. Treat this evidence as compromised.'}</div>
    </section>
  `;
}

function renderRelationshipMap(item) {
  if (!item) return '';
  return `
    <section class="panel-card" style="margin-top:16px">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Evidence Relationship Map</h3>
          <p class="muted">Case-to-folder-to-evidence trace for the selected artifact.</p>
        </div>
      </div>
      <div class="relationship-map">
        <div class="relationship-node">
          <strong>Case</strong>
          <span>${escapeHtml(item.caseNumber || 'Unlinked')}</span>
          <small>${escapeHtml(item.caseTitle || 'No case title')}</small>
        </div>
        <div class="relationship-link"></div>
        <div class="relationship-node">
          <strong>Folder</strong>
          <span>${escapeHtml(item.folderName || 'General Evidence')}</span>
          <small>${escapeHtml(item.metadata?.incidentType || 'No incident type')}</small>
        </div>
        <div class="relationship-link"></div>
        <div class="relationship-node active">
          <strong>Evidence</strong>
          <span>${escapeHtml(item.id)}</span>
          <small>${escapeHtml(item.fileName)}</small>
        </div>
      </div>
    </section>
  `;
}

function renderCertificateActions(item) {
  if (!item) return '';
  return `
    <section class="panel-card" style="margin-top:16px">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Integrity Certificate</h3>
          <p class="muted">Printable certificate for the selected evidence item.</p>
        </div>
      </div>
      <div class="split-actions">
        <a class="ghost-button" href="/reports/evidence/${item.id}/certificate" target="_blank">${pdfIcon()} Printable Certificate</a>
      </div>
    </section>
  `;
}

function bindShellEvents() {
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSection = button.dataset.section;
      renderShell();
    });
  });

  document.querySelectorAll('[data-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSection = button.dataset.jump;
      renderShell();
    });
  });

  document.querySelectorAll('[data-action="theme"]').forEach((button) => {
    button.addEventListener('click', toggleTheme);
  });

  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', logout);
  });

  const refreshButton = document.getElementById('refresh-records');
  if (refreshButton) refreshButton.addEventListener('click', refreshEvidence);

  const uploadButton = document.getElementById('upload-button');
  const fileInput = document.getElementById('file-input');
  const uploadFolder = document.getElementById('upload-folder');
  const uploadCase = document.getElementById('upload-case');
  const uploadDeviceSource = document.getElementById('upload-device-source');
  const uploadSeizureDate = document.getElementById('upload-seizure-date');
  const uploadIncidentType = document.getElementById('upload-incident-type');
  const uploadSeverity = document.getElementById('upload-severity');
  const uploadTags = document.getElementById('upload-tags');
  const uploadNotes = document.getElementById('upload-notes');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      state.upload.file = fileInput.files[0] || null;
    });
  }
  if (uploadCase) {
    uploadCase.addEventListener('change', () => {
      state.upload.caseId = uploadCase.value;
    });
  }
  if (uploadFolder) {
    uploadFolder.addEventListener('change', () => {
      state.upload.folderId = uploadFolder.value;
      const selectedFolder = state.folders.find((folder) => folder.id === uploadFolder.value);
      if (selectedFolder?.caseId) {
        state.upload.caseId = selectedFolder.caseId;
        if (uploadCase) uploadCase.value = selectedFolder.caseId;
      }
    });
  }
  if (uploadDeviceSource) uploadDeviceSource.addEventListener('input', () => { state.upload.deviceSource = uploadDeviceSource.value; });
  if (uploadSeizureDate) uploadSeizureDate.addEventListener('input', () => { state.upload.seizureDate = uploadSeizureDate.value; });
  if (uploadIncidentType) uploadIncidentType.addEventListener('input', () => { state.upload.incidentType = uploadIncidentType.value; });
  if (uploadSeverity) uploadSeverity.addEventListener('change', () => { state.upload.severity = uploadSeverity.value; });
  if (uploadTags) uploadTags.addEventListener('input', () => { state.upload.tags = uploadTags.value; });
  if (uploadNotes) uploadNotes.addEventListener('input', () => { state.upload.investigatorNotes = uploadNotes.value; });
  if (uploadButton) {
    uploadButton.addEventListener('click', uploadEvidence);
  }

  const evidenceFilterButton = document.getElementById('apply-evidence-filters');
  if (evidenceFilterButton) evidenceFilterButton.addEventListener('click', applyEvidenceFilters);

  const auditFilterButton = document.getElementById('apply-audit-filters');
  if (auditFilterButton) auditFilterButton.addEventListener('click', applyAuditFilters);

  const createUserForm = document.getElementById('create-user-form');
  if (createUserForm) createUserForm.addEventListener('submit', createInvestigatorUser);
  const createReviewerForm = document.getElementById('create-reviewer-form');
  if (createReviewerForm) createReviewerForm.addEventListener('submit', createExternalReviewerUser);

  const createFolderForm = document.getElementById('create-folder-form');
  if (createFolderForm) createFolderForm.addEventListener('submit', createFolder);

  const createCaseForm = document.getElementById('create-case-form');
  if (createCaseForm) createCaseForm.addEventListener('submit', createCase);

  const complianceScheduleForm = document.getElementById('compliance-schedule-form');
  if (complianceScheduleForm) complianceScheduleForm.addEventListener('submit', saveComplianceSchedule);

  const assignFolderCaseForm = document.getElementById('assign-folder-case-form');
  if (assignFolderCaseForm) assignFolderCaseForm.addEventListener('submit', assignFolderCase);

  const caseAllotmentForm = document.getElementById('case-allotment-form');
  if (caseAllotmentForm) caseAllotmentForm.addEventListener('submit', allotCaseInvestigator);

  document.querySelectorAll('[data-verify]').forEach((button) => {
    button.addEventListener('click', () => verifyEvidence(button.dataset.verify));
  });

  document.querySelectorAll('[data-preview]').forEach((button) => {
    button.addEventListener('click', () => previewEvidence(button.dataset.preview));
  });

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = `/api/evidence/${button.dataset.download}/download`;
    });
  });

  document.querySelectorAll('[data-request-approval]').forEach((button) => {
    button.addEventListener('click', () => requestApproval(button.dataset.requestApproval, button.dataset.targetId));
  });

  document.querySelectorAll('[data-delete-evidence]').forEach((button) => {
    button.addEventListener('click', () => deleteEvidence(button.dataset.deleteEvidence));
  });

  document.querySelectorAll('[data-toggle-user]').forEach((button) => {
    button.addEventListener('click', () => toggleManagedUserStatus(button.dataset.toggleUser));
  });

  document.querySelectorAll('[data-reset-user]').forEach((button) => {
    button.addEventListener('click', () => resetManagedUserPassword(button.dataset.resetUser));
  });

  document.querySelectorAll('[data-rename-folder]').forEach((button) => {
    button.addEventListener('click', () => renameFolder(button.dataset.renameFolder));
  });

  document.querySelectorAll('[data-view-folder]').forEach((button) => {
    button.addEventListener('click', () => openFolderView(button.dataset.viewFolder));
  });

  document.querySelectorAll('[data-open-case-feed]').forEach((button) => {
    button.addEventListener('click', () => openCaseFeed(button.dataset.openCaseFeed));
  });

  document.querySelectorAll('[data-pin-case]').forEach((button) => {
    button.addEventListener('click', () => togglePinnedCase(button.dataset.pinCase));
  });

  document.querySelectorAll('[data-reassign-case]').forEach((button) => {
    button.addEventListener('click', () => focusCaseAssignment(button.dataset.reassignCase));
  });

  document.querySelectorAll('[data-archive-folder]').forEach((button) => {
    button.addEventListener('click', () => toggleFolderArchive(button.dataset.archiveFolder));
  });

  document.querySelectorAll('[data-delete-folder]').forEach((button) => {
    button.addEventListener('click', () => deleteFolder(button.dataset.deleteFolder));
  });

  document.querySelectorAll('[data-approval-decision]').forEach((button) => {
    button.addEventListener('click', () => reviewApproval(button.dataset.approvalId, button.dataset.approvalDecision));
  });

  document.querySelectorAll('[data-dismiss-notification]').forEach((button) => {
    button.addEventListener('click', () => dismissNotification(button.dataset.dismissNotification));
  });

  const commentForm = document.getElementById('comment-form');
  if (commentForm) commentForm.addEventListener('submit', submitEvidenceComment);
  const viewerSearch = document.getElementById('viewer-search');
  if (viewerSearch) viewerSearch.addEventListener('input', onViewerSearchInput);
  const viewerZoom = document.getElementById('viewer-zoom');
  if (viewerZoom) viewerZoom.addEventListener('input', onViewerZoomInput);
  const viewerAnnotation = document.getElementById('viewer-annotation');
  if (viewerAnnotation) viewerAnnotation.addEventListener('input', onViewerAnnotationInput);

  const modalClose = document.getElementById('modal-close');
  const modalOk = document.getElementById('modal-ok');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirmDelete = document.getElementById('modal-confirm-delete');
  const deleteConfirmInput = document.getElementById('delete-confirm-input');
  if (modalClose) modalClose.addEventListener('click', clearModal);
  if (modalOk) modalOk.addEventListener('click', clearModal);
  if (modalCancel) modalCancel.addEventListener('click', clearModal);
  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener('input', onDeleteConfirmInput);
    deleteConfirmInput.focus();
  }
  if (modalConfirmDelete) modalConfirmDelete.addEventListener('click', submitDeleteConfirmation);

  const openNotifications = document.getElementById('open-notifications');
  if (openNotifications) {
    openNotifications.addEventListener('click', () => {
      state.activeSection = 'dashboard';
      renderShell();
      const firstNotification = document.querySelector('.timeline-item');
      if (firstNotification) firstNotification.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById('login-submit');
  const note = document.getElementById('login-note');
  const formData = new FormData(form);
  const payload = {
    role: config.role,
    username: formData.get('username'),
    password: formData.get('password')
  };

  try {
    if (submit) submit.disabled = true;
    if (note) note.textContent = 'Verifying credentials...';
    const result = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    window.location.href = result.redirectTo;
  } catch (error) {
    if (note) note.textContent = error.message || 'Authentication failed.';
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function refreshEvidence() {
  const result = await fetchEvidenceData();
  state.evidence = result.records;
  renderShell();
}

async function refreshManagedUsers() {
  if (!isAdmin()) return;
  const result = await fetchJson('/api/users');
  state.users = result.users;
  state.investigators = state.users.filter((user) => user.role === 'investigator');
}

async function refreshCases() {
  const result = await fetchJson('/api/cases');
  state.cases = result.cases;
  if (!state.cases.some((entry) => entry.id === state.upload.caseId)) {
    state.upload.caseId = state.cases[0]?.id || '';
  }
}

async function refreshApprovals() {
  if (!isOps()) return;
  const result = await fetchJson('/api/approvals');
  state.approvals = result.approvals;
}

async function refreshNotifications() {
  const result = await fetchJson('/api/notifications');
  state.notifications = result.notifications || [];
}

async function refreshFolders() {
  const result = await fetchJson('/api/folders');
  state.folders = result.folders;
  if (!activeFolderOptions().some((folder) => folder.id === state.upload.folderId)) {
    state.upload.folderId = activeFolderOptions()[0]?.id || '';
  }
}

async function openFolderView(folderId) {
  await loadAllData();
  state.selectedFolderId = folderId;
  state.activeSection = 'folders';
  rememberRecentFolder(folderId);
  renderShell();
}

async function openCaseFeed(caseId) {
  const result = await fetchJson(`/api/cases/${caseId}/feed`);
  state.selectedCaseId = caseId;
  state.caseFeed = result.feed;
  state.activeSection = 'cases';
  renderShell();
}

async function applyEvidenceFilters() {
  state.filters.evidenceSearch = document.getElementById('evidence-search').value;
  state.filters.evidenceStatus = document.getElementById('evidence-status').value;
  const uploader = document.getElementById('evidence-uploader');
  const folder = document.getElementById('evidence-folder');
  state.filters.evidenceUploader = uploader ? uploader.value : 'all';
  state.filters.evidenceFolder = folder ? folder.value : 'all';
  const result = await fetchEvidenceData();
  state.evidence = result.records;
  renderShell();
}

async function applyAuditFilters() {
  state.filters.auditSearch = document.getElementById('audit-search').value;
  state.filters.auditStatus = document.getElementById('audit-status').value;
  const params = new URLSearchParams();
  if (state.filters.auditSearch) params.set('q', state.filters.auditSearch);
  if (state.filters.auditStatus && state.filters.auditStatus !== 'all') params.set('status', state.filters.auditStatus);
  const result = await fetchJson(`/api/audit-logs?${params.toString()}`);
  state.auditLogs = result.logs;
  renderShell();
}

async function fetchEvidenceData() {
  const params = new URLSearchParams();
  if (state.filters.evidenceSearch) params.set('q', state.filters.evidenceSearch);
  if (state.filters.evidenceStatus !== 'all') params.set('status', state.filters.evidenceStatus);
  if (state.filters.evidenceUploader !== 'all') params.set('uploader', state.filters.evidenceUploader);
  if (state.filters.evidenceFolder !== 'all') params.set('folder', state.filters.evidenceFolder);
  return fetchJson(`/api/evidence?${params.toString()}`);
}

async function uploadEvidence() {
  if (!state.upload.file) {
    showModal('No File Selected', 'Choose a file before starting the secure upload.');
    return;
  }

  state.upload.status = 'uploading';
  state.upload.progress = 0;
  renderShell();

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/evidence/upload');
  xhr.setRequestHeader('X-File-Name', encodeURIComponent(state.upload.file.name));
  xhr.setRequestHeader('X-File-Type', state.upload.file.type || 'application/octet-stream');
  xhr.setRequestHeader('X-Folder-Id', state.upload.folderId || (state.folders[0]?.id || ''));
  xhr.setRequestHeader('X-Case-Id', state.upload.caseId || '');
  xhr.setRequestHeader('X-Device-Source', state.upload.deviceSource || '');
  xhr.setRequestHeader('X-Seizure-Date', state.upload.seizureDate || '');
  xhr.setRequestHeader('X-Incident-Type', state.upload.incidentType || '');
  xhr.setRequestHeader('X-Severity', state.upload.severity || 'medium');
  xhr.setRequestHeader('X-Tags', state.upload.tags || '');
  xhr.setRequestHeader('X-Investigator-Notes', state.upload.investigatorNotes || '');

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      state.upload.progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
      const fill = document.querySelector('.progress-fill');
      if (fill) fill.style.width = `${state.upload.progress}%`;
    }
  };

  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const result = JSON.parse(xhr.responseText);
      state.upload.status = 'done';
      state.upload.progress = 100;
      state.upload.lastHash = result.evidence.hash;
      state.upload.lastEvidenceId = result.evidence.id;
      state.upload.deviceSource = '';
      state.upload.seizureDate = '';
      state.upload.incidentType = '';
      state.upload.severity = 'medium';
      state.upload.tags = '';
      state.upload.investigatorNotes = '';
      await loadAllData();
      state.activeSection = 'upload';
      renderShell();
    } else {
      state.upload.status = 'idle';
      state.upload.progress = 0;
      showModal('Upload Failed', (JSON.parse(xhr.responseText || '{}').error) || 'Secure upload failed.');
      renderShell();
    }
  };

  xhr.onerror = () => {
    state.upload.status = 'idle';
    state.upload.progress = 0;
    showModal('Upload Failed', 'Unable to reach the secure upload endpoint.');
    renderShell();
  };

  xhr.send(await state.upload.file.arrayBuffer());
}

async function verifyEvidence(id) {
  try {
    const result = await fetchJson(`/api/evidence/${id}/verify`, { method: 'POST' });
    state.lastVerification = {
      id,
      originalHash: result.evidence.hash,
      recalculatedHash: result.recalculatedHash,
      authentic: result.authentic
    };
    await loadAllData();
    state.activeSection = 'records';
    if (!result.authentic) {
      showModal('Tampering Detected', 'WARNING: Evidence integrity compromised!');
    } else {
      showModal('Integrity Verified', 'File is Authentic');
    }
  } catch (error) {
    showModal('Verification Failed', error.message || 'Unable to verify evidence integrity.');
  }
}

async function previewEvidence(id) {
  try {
    state.preview = await fetchJson(`/api/evidence/${id}/preview`);
    state.preview.evidenceId = id;
    state.viewerSearch = '';
    state.viewerZoom = 100;
    state.imageAnnotation = '';
    const commentsPayload = await fetchJson(`/api/evidence/${id}/comments`);
    state.comments = commentsPayload.comments || [];
    rememberPreviewHistory(id);
    state.activeSection = 'records';
    renderShell();
  } catch (error) {
    showModal('Preview Unavailable', error.message || 'Unable to load file preview.');
  }
}

async function deleteEvidence(id) {
  const target = state.evidence.find((item) => item.id === id);
  if (!target) return;
  state.modal = {
    kind: 'delete-confirm',
    title: 'Delete Evidence Record',
    message: `This will permanently remove "${target.fileName}" from secure storage. This action cannot be undone.`,
    target,
    inputValue: ''
  };
  renderShell();
}

async function createInvestigatorUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.getElementById('user-management-note');
  const formData = new FormData(form);

  try {
    const result = await fetchJson('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: formData.get('displayName'),
        username: formData.get('username'),
        password: formData.get('password')
      })
    });
    await refreshManagedUsers();
    form.reset();
    state.activeSection = 'users';
    renderShell();
    showModal('Investigator Created', `${result.user.username} is ready for secure sign-in.`);
  } catch (error) {
    if (note) note.textContent = error.message || 'Unable to create investigator account.';
  }
}

async function createExternalReviewerUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const formData = new FormData(form);
    const result = await fetchJson('/api/external-reviewers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: formData.get('displayName'),
        caseId: formData.get('caseId'),
        expiresInHours: Number(formData.get('expiresInHours') || 24)
      })
    });
    await refreshManagedUsers();
    form.reset();
    renderShell();
    showModal('Temporary Reviewer Created', `${result.user.username} can sign in via /login/reviewer with temporary password: ${result.temporaryPassword}`);
  } catch (error) {
    showModal('Reviewer Creation Failed', error.message || 'Unable to create temporary reviewer.');
  }
}

async function toggleManagedUserStatus(userId) {
  try {
    const result = await fetchJson(`/api/users/${userId}/toggle-status`, { method: 'POST' });
    await refreshManagedUsers();
    state.activeSection = 'users';
    renderShell();
    showModal('User Updated', `${result.user.username} is now ${result.user.status}.`);
  } catch (error) {
    showModal('Update Failed', error.message || 'Unable to update investigator status.');
  }
}

async function resetManagedUserPassword(userId) {
  try {
    const result = await fetchJson(`/api/users/${userId}/reset-password`, { method: 'POST' });
    await refreshManagedUsers();
    state.activeSection = 'users';
    renderShell();
    showModal('Temporary Password Issued', `${result.user.username} password reset. Temporary password: ${result.temporaryPassword}`);
  } catch (error) {
    showModal('Reset Failed', error.message || 'Unable to reset investigator password.');
  }
}

async function createFolder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.getElementById('folder-management-note');
  const formData = new FormData(form);
  try {
    const result = await fetchJson('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        description: formData.get('description'),
        caseId: formData.get('caseId')
      })
    });
    await refreshFolders();
    form.reset();
    state.activeSection = 'folders';
    renderShell();
    showModal('Folder Created', `${result.folder.name} is ready for evidence intake.`);
  } catch (error) {
    if (note) note.textContent = error.message || 'Unable to create folder.';
  }
}

async function createCase(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.getElementById('case-management-note');
  const formData = new FormData(form);
  const investigatorSelect = document.getElementById('new-case-investigators');
  const assignedInvestigatorIds = investigatorSelect
    ? [...investigatorSelect.selectedOptions].map((option) => option.value)
    : [];

  try {
    await fetchJson('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseNumber: formData.get('caseNumber'),
        title: formData.get('title'),
        suspectName: formData.get('suspectName'),
        department: formData.get('department'),
        notes: formData.get('notes'),
        assignedInvestigatorIds
      })
    });
    await refreshCases();
    form.reset();
    state.activeSection = 'cases';
    renderShell();
    showModal('Case Created', 'The new case is ready for folder linking and evidence intake.');
  } catch (error) {
    if (note) note.textContent = error.message || 'Unable to create case.';
  }
}

async function assignFolderCase(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const folderId = String(formData.get('folderId') || '');
  const caseId = String(formData.get('caseId') || '');
  if (!folderId) return;

  try {
    await fetchJson(`/api/folders/${folderId}/assign-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId })
    });
    await loadAllData();
    state.activeSection = 'cases';
    renderShell();
    showModal('Folder Link Updated', caseId ? 'Folder linked to case successfully.' : 'Folder is now unlinked from any case.');
  } catch (error) {
    showModal('Case Link Failed', error.message || 'Unable to update folder linkage.');
  }
}

async function requestApproval(type, targetId) {
  const note = window.prompt('Add a short justification for this approval request:', '') ?? '';
  try {
    await fetchJson('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, targetId, note })
    });
    await refreshApprovals();
    await loadAllData();
    state.activeSection = 'approvals';
    renderShell();
    showModal('Approval Requested', 'The action has been added to the supervisor review queue.');
  } catch (error) {
    showModal('Approval Failed', error.message || 'Unable to create approval request.');
  }
}

async function reviewApproval(approvalId, decision) {
  const note = window.prompt(`Add an optional note for this ${decision} decision:`, '') ?? '';
  try {
    await fetchJson(`/api/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note })
    });
    await loadAllData();
    state.activeSection = 'approvals';
    renderShell();
    showModal('Approval Updated', `The request has been ${decision}.`);
  } catch (error) {
    showModal('Review Failed', error.message || 'Unable to review approval.');
  }
}

async function submitEvidenceComment(event) {
  event.preventDefault();
  if (!state.preview?.evidenceId) return;
  const input = document.getElementById('comment-input');
  if (!input || !input.value.trim()) return;
  try {
    await fetchJson(`/api/evidence/${state.preview.evidenceId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input.value.trim() })
    });
    const result = await fetchJson(`/api/evidence/${state.preview.evidenceId}/comments`);
    state.comments = result.comments;
    input.value = '';
    renderShell();
  } catch (error) {
    showModal('Comment Failed', error.message || 'Unable to add evidence comment.');
  }
}

async function reassignCaseInvestigators(caseId) {
  const forensicCase = state.cases.find((entry) => entry.id === caseId);
  if (!forensicCase) return;
  const usernames = window.prompt('Enter investigator usernames separated by commas:', forensicCase.assignedInvestigatorNames.join(', '));
  if (usernames == null) return;
  const investigatorIds = state.users
    .filter((user) => usernames.toLowerCase().split(',').map((value) => value.trim()).includes(user.username.toLowerCase()) || usernames.toLowerCase().includes(user.displayName.toLowerCase()))
    .map((user) => user.id);
  try {
    await fetchJson(`/api/cases/${caseId}/assign-investigators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedInvestigatorIds: investigatorIds })
    });
    await loadAllData();
    state.activeSection = 'cases';
    renderShell();
    showModal('Assignments Updated', `${forensicCase.caseNumber} was reassigned successfully.`);
  } catch (error) {
    showModal('Assignment Failed', error.message || 'Unable to update case assignment.');
  }
}

function focusCaseAssignment(caseId) {
  state.selectedCaseId = caseId;
  state.activeSection = 'cases';
  renderShell();
  const caseSelect = document.getElementById('allot-case-id');
  if (caseSelect) {
    caseSelect.value = caseId;
    caseSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function allotCaseInvestigator(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const caseId = String(formData.get('caseId') || '');
  const investigatorId = String(formData.get('investigatorId') || '');
  const note = document.getElementById('case-allotment-note');
  const forensicCase = state.cases.find((entry) => entry.id === caseId);
  const investigator = assignableInvestigators().find((entry) => entry.id === investigatorId);

  if (!forensicCase || !investigator) {
    if (note) note.textContent = 'Choose a valid case and investigator.';
    return;
  }

  const assignedInvestigatorIds = [...new Set([...(forensicCase.assignedInvestigatorIds || []), investigatorId])];

  try {
    await fetchJson(`/api/cases/${caseId}/assign-investigators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedInvestigatorIds })
    });
    await loadAllData();
    state.selectedCaseId = caseId;
    state.activeSection = 'cases';
    renderShell();
    showModal('Investigator Allotted', `${investigator.displayName} was assigned to ${forensicCase.caseNumber}.`);
  } catch (error) {
    showModal('Assignment Failed', error.message || 'Unable to allot investigator to the selected case.');
  }
}

async function dismissNotification(notificationId) {
  try {
    await fetchJson(`/api/notifications/${notificationId}/dismiss`, { method: 'POST' });
    await refreshNotifications();
    renderShell();
  } catch (error) {
    showModal('Notification Error', error.message || 'Unable to update notification state.');
  }
}

async function saveComplianceSchedule(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  try {
    const result = await fetchJson('/api/compliance-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: formData.get('enabled') === 'true',
        cadence: formData.get('cadence'),
        recipients: String(formData.get('recipients') || '').split(',').map((value) => value.trim()).filter(Boolean),
        nextRunAt: new Date(String(formData.get('nextRunAt') || '')).toISOString()
      })
    });
    state.complianceSettings = result.settings;
    renderShell();
    showModal('Compliance Schedule Saved', 'Recurring compliance report settings were updated.');
  } catch (error) {
    showModal('Schedule Update Failed', error.message || 'Unable to save compliance schedule.');
  }
}

async function renameFolder(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  if (!folder) return;
  const nextName = window.prompt('Enter the new folder name:', folder.name);
  if (!nextName || nextName.trim() === folder.name) return;
  const nextDescription = window.prompt('Update the folder description:', folder.description || '') ?? folder.description ?? '';

  try {
    const result = await fetchJson(`/api/folders/${folderId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName.trim(), description: nextDescription.trim() })
    });
    await loadAllData();
    state.activeSection = 'folders';
    renderShell();
    showModal('Folder Updated', `${result.folder.name} was updated successfully.`);
  } catch (error) {
    showModal('Rename Failed', error.message || 'Unable to rename folder.');
  }
}

async function toggleFolderArchive(folderId) {
  try {
    const result = await fetchJson(`/api/folders/${folderId}/toggle-archive`, { method: 'POST' });
    await loadAllData();
    state.activeSection = 'folders';
    renderShell();
    showModal('Folder Updated', `${result.folder.name} is now ${result.folder.status}.`);
  } catch (error) {
    showModal('Update Failed', error.message || 'Unable to update folder status.');
  }
}

async function deleteFolder(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  if (!folder) return;
  const confirmed = window.confirm(`Delete folder "${folder.name}"? This works only if the folder contains no evidence.`);
  if (!confirmed) return;

  try {
    await fetchJson(`/api/folders/${folderId}`, { method: 'DELETE' });
    await loadAllData();
    state.activeSection = 'folders';
    renderShell();
    showModal('Folder Deleted', `${folder.name} was removed.`);
  } catch (error) {
    showModal('Delete Failed', error.message || 'Unable to delete folder.');
  }
}

async function logout() {
  await fetchJson('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('deims_theme', nextTheme);
}

function bindGlobalShortcuts() {
  if (window.__deimsShortcutsBound) return;
  window.__deimsShortcutsBound = true;
  document.addEventListener('keydown', (event) => {
    const targetTag = event.target?.tagName;
    const typing = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || event.target?.isContentEditable;
    if (typing && event.key !== 'Escape') return;

    if (event.key === '/') {
      event.preventDefault();
      const input = document.getElementById('viewer-search') || document.getElementById('evidence-search');
      if (input) input.focus();
      return;
    }
    if (event.key.toLowerCase() === 'v' && state.preview?.evidenceId) {
      event.preventDefault();
      verifyEvidence(state.preview.evidenceId);
      return;
    }
    if (event.key.toLowerCase() === 'd' && state.preview?.evidenceId && !isReviewer()) {
      event.preventDefault();
      window.location.href = `/api/evidence/${state.preview.evidenceId}/download`;
      return;
    }
    if (event.key.toLowerCase() === 'p' && state.previewHistory[0]?.evidenceId) {
      event.preventDefault();
      previewEvidence(state.previewHistory[0].evidenceId);
      return;
    }
    if (event.key === 'Escape' && state.modal) {
      clearModal();
    }
  });
}

function onViewerSearchInput(event) {
  state.viewerSearch = event.currentTarget.value;
  renderShell();
}

function onViewerZoomInput(event) {
  state.viewerZoom = Number(event.currentTarget.value || 100);
  renderShell();
}

function onViewerAnnotationInput(event) {
  state.imageAnnotation = event.currentTarget.value;
  renderShell();
}

function togglePasswordVisibility() {
  const input = document.getElementById('password');
  const toggle = document.getElementById('password-toggle');
  if (!input || !toggle) return;

  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  toggle.setAttribute('aria-pressed', String(!visible));
  toggle.innerHTML = visible ? eyeIcon() : eyeOffIcon();
}

function showModal(title, message) {
  state.modal = { kind: 'notice', title, message };
  renderShell();
}

function clearModal(event) {
  if (event && event.target.id === 'modal-close' && event.target !== event.currentTarget) return;
  state.modal = null;
  renderShell();
}

function onDeleteConfirmInput(event) {
  if (!state.modal || state.modal.kind !== 'delete-confirm') return;
  state.modal.inputValue = event.currentTarget.value;
  renderShell();
}

async function submitDeleteConfirmation() {
  if (!state.modal || state.modal.kind !== 'delete-confirm') return;
  const { target, inputValue } = state.modal;
  if (inputValue !== target.id) return;

  try {
    state.modal = null;
    await fetchJson('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delete_evidence',
        targetId: target.id,
        note: `Typed confirmation completed for evidence ${target.id}.`
      })
    });
    await loadAllData();
    state.activeSection = 'approvals';
    renderShell();
    showModal('Delete Approval Requested', `${target.fileName} is now waiting for Admin and Supervisor approval before deletion.`);
  } catch (error) {
    showModal('Delete Failed', error.message || 'Unable to delete evidence.');
  }
}

function metricCard(label, value, note) {
  return `
    <article class="metric-card">
      <span class="metric-label">${label}</span>
      <div class="metric-value">${value}</div>
      <p class="muted">${note}</p>
    </article>
  `;
}

function renderDashboardWidgets() {
  const widgets = state.dashboard?.widgets;
  if (!widgets) return '';
  return `
    <section class="two-col">
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Active Threats</h2>
            <p class="muted">Current integrity and access risks highlighted by the system.</p>
          </div>
        </div>
        <div class="role-grid">
          ${widgets.activeThreats.map((item) => `<div class="mini-stat"><strong>${item.value}</strong><span class="muted">${escapeHtml(item.label)}</span></div>`).join('')}
        </div>
      </article>
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Recent Anomalies</h2>
            <p class="muted">Operational outliers that may require follow-up.</p>
          </div>
        </div>
        <div class="role-grid">
          ${widgets.anomalies.map((item) => `<div class="mini-stat"><strong>${item.value}</strong><span class="muted">${escapeHtml(item.label)}</span></div>`).join('')}
        </div>
      </article>
    </section>
  `;
}

function renderNotificationCenter() {
  const notifications = state.notifications.slice(0, 5);
  return `
    <section class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Notification Center</h2>
          <p class="muted">Mentions and reporting-related alerts for your account.</p>
        </div>
      </div>
      <div class="timeline">
        ${notifications.map(renderNotificationItem).join('') || `<p class="muted">No notifications yet.</p>`}
      </div>
    </section>
  `;
}

function renderReportingWidgets() {
  if (!isAdmin()) return '';
  return `
    <section class="two-col">
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Compliance Schedule</h2>
            <p class="muted">Configure recurring compliance-report generation settings.</p>
          </div>
        </div>
        <form class="toolbar" id="compliance-schedule-form">
          <div class="field">
            <label for="compliance-enabled">Report Schedule</label>
            <select id="compliance-enabled" name="enabled">
              <option value="true"${state.complianceSettings?.enabled ? ' selected' : ''}>Enabled</option>
              <option value="false"${state.complianceSettings?.enabled ? '' : ' selected'}>Disabled</option>
            </select>
          </div>
          <div class="field">
            <label for="compliance-cadence">Cadence</label>
            <select id="compliance-cadence" name="cadence">
              <option value="weekly"${state.complianceSettings?.cadence === 'weekly' ? ' selected' : ''}>Weekly</option>
              <option value="monthly"${state.complianceSettings?.cadence === 'monthly' ? ' selected' : ''}>Monthly</option>
            </select>
          </div>
          <div class="field">
            <label for="compliance-recipients">Recipients</label>
            <input id="compliance-recipients" name="recipients" value="${escapeHtml((state.complianceSettings?.recipients || []).join(', '))}" placeholder="admin-chief, supervisor-lead" />
          </div>
          <div class="field">
            <label for="compliance-next-run">Next Run</label>
            <input id="compliance-next-run" name="nextRunAt" type="datetime-local" value="${formatDateTimeLocal(state.complianceSettings?.nextRunAt)}" />
          </div>
          <button class="ghost-button" type="submit">${pdfIcon()} Save Schedule</button>
        </form>
      </article>
      <article class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Enterprise Reporting</h2>
            <p class="muted">Generate case-level reports, exports, and evidence certificates.</p>
          </div>
        </div>
        <div class="split-actions">
          <a class="ghost-button" href="/exports/cases.csv">${downloadIcon()} Case CSV</a>
          <a class="ghost-button" href="/exports/evidence.csv">${downloadIcon()} Evidence CSV</a>
          <a class="ghost-button" href="/audit-report" target="_blank">${pdfIcon()} Audit PDF</a>
        </div>
        <p class="inline-note">Open any case for its automated report, or any evidence preview for its printable integrity certificate.</p>
      </article>
    </section>
  `;
}

function renderRoleSpotlight(summary) {
  if (isOps()) {
    return `
      <section class="role-banner">
        <article class="panel-card role-panel">
          <div class="panel-header">
            <div>
              <p class="badge">${commandIcon()} ${isAdmin() ? 'Admin Responsibilities' : 'Supervisor Responsibilities'}</p>
              <h2 class="panel-title">Oversight and integrity governance</h2>
              <p class="muted">${isAdmin() ? 'The admin view emphasizes policy visibility, tamper escalation, and audit export readiness.' : 'The supervisor view emphasizes approvals, reassignment, and anomaly monitoring.'}</p>
            </div>
            <button class="ghost-button" data-jump="audit">${auditIcon()} Review Logs</button>
          </div>
          <div class="role-grid">
            <div class="mini-stat"><strong>${summary.tamperedEvidence}</strong><span class="muted">Files under escalation review</span></div>
            <div class="mini-stat"><strong>${summary.recentActivities}</strong><span class="muted">Recorded audit activities</span></div>
            <div class="mini-stat"><strong>${summary.pendingApprovals || 0}</strong><span class="muted">Pending approval requests</span></div>
          </div>
        </article>
      </section>
    `;
  }

  return `
    <section class="role-banner">
      <article class="panel-card role-panel">
        <div class="panel-header">
          <div>
            <p class="badge">${caseIcon()} Investigator Workflow</p>
            <h2 class="panel-title">Collect, lock, and verify case evidence</h2>
            <p class="muted">The investigator view is tuned for fast intake, preview, and authenticity checks during casework.</p>
          </div>
          <button class="ghost-button" data-jump="upload">${uploadIcon()} New Upload</button>
        </div>
        <div class="role-grid">
          <div class="mini-stat"><strong>${summary.totalEvidence}</strong><span class="muted">Evidence items available for case review</span></div>
          <div class="mini-stat"><strong>${summary.secureEvidence}</strong><span class="muted">Authentic items ready for verification records</span></div>
          <div class="mini-stat"><strong>SHA-256</strong><span class="muted">Hash lock created at the moment of upload</span></div>
        </div>
      </article>
    </section>
  `;
}

function renderEvidenceRowCompact(item) {
  return `
    <tr class="${item.status.toLowerCase() === 'tampered' ? 'tampered' : ''}">
      <td><strong>${escapeHtml(item.id)}</strong></td>
      <td>${escapeHtml(item.fileName)}</td>
      <td><span class="hash-pill">${escapeHtml(item.hashPreview)}</span></td>
      <td><span class="status-pill ${item.status.toLowerCase()}">${statusDot(item.status)} ${escapeHtml(item.status)}</span></td>
    </tr>
  `;
}

function renderEvidenceRowFull(item) {
  return `
    <tr class="${item.status.toLowerCase() === 'tampered' ? 'tampered' : ''}">
      <td>
        <strong>${escapeHtml(item.fileName)}</strong>
        <div class="inline-note">${escapeHtml(item.id)}</div>
      </td>
      <td>
        <strong>${escapeHtml(item.caseNumber || 'Unlinked')}</strong>
        <div class="inline-note">${escapeHtml(item.caseTitle || 'No case linked')}</div>
      </td>
      <td>${escapeHtml(item.folderName || 'General Evidence')}</td>
      <td>${formatDate(item.uploadedAt)}</td>
      <td>${escapeHtml(item.uploadedBy)}</td>
      <td><span class="hash-pill">${escapeHtml(item.hashPreview)}</span></td>
      <td><span class="status-pill ${item.status.toLowerCase()}">${statusDot(item.status)} ${escapeHtml(item.status)}</span></td>
      <td>
        <div class="split-actions">
          <button class="ghost-button" data-verify="${item.id}">${shieldIcon()} Verify Integrity</button>
          <button class="ghost-button" data-preview="${item.id}">${previewIcon()} Preview</button>
          ${!isReviewer() ? `<button class="ghost-button" data-download="${item.id}">${downloadIcon()} Download</button>` : ''}
          ${isOps() ? `<button class="danger-button" data-request-approval="delete_evidence" data-target-id="${item.id}">${trashIcon()} Request Delete</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderAuditRow(log) {
  return `
    <tr>
      <td>${escapeHtml(log.user)}</td>
      <td>${escapeHtml(log.action)}</td>
      <td>${formatDate(log.timestamp)}</td>
      <td><span class="status-pill ${String(log.status).toLowerCase()}">${statusDot(log.status)} ${escapeHtml(log.status)}</span></td>
      <td>${escapeHtml(log.detail || '')}</td>
    </tr>
  `;
}

function renderManagedUserRow(user) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(user.displayName)}</strong>
        <div class="inline-note">${escapeHtml(user.username)}</div>
      </td>
      <td>${escapeHtml(user.role)}</td>
      <td><span class="status-pill ${user.status === 'disabled' ? 'failed' : 'secure'}">${statusDot(user.status === 'disabled' ? 'Failed' : 'Secure')} ${escapeHtml(user.status)}</span></td>
      <td>${user.lastLoginAt ? formatDate(user.lastLoginAt) : '<span class="muted">Never</span>'}</td>
      <td>${user.failedLoginAttempts}${user.lockedUntil ? ` <span class="inline-note">(locked until ${formatDate(user.lockedUntil)})</span>` : ''}${user.expiresAt ? ` <div class="inline-note">expires ${formatDate(user.expiresAt)}</div>` : ''}</td>
      <td>
        <div class="split-actions">
          ${user.role === 'investigator' ? `<button class="ghost-button" data-toggle-user="${user.id}">${user.status === 'disabled' ? shieldIcon() : warningIcon()} ${user.status === 'disabled' ? 'Enable' : 'Disable'}</button>` : ''}
          ${user.role === 'investigator' ? `<button class="ghost-button" data-reset-user="${user.id}">${lockIcon()} Reset Password</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderCaseRow(forensicCase) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(forensicCase.caseNumber)}</strong>
        <div class="inline-note">${escapeHtml(forensicCase.title)}</div>
        <div class="inline-note">${escapeHtml(forensicCase.suspectName || 'No subject recorded')}</div>
      </td>
      <td>${escapeHtml(forensicCase.department)}</td>
      <td>${escapeHtml((forensicCase.assignedInvestigatorNames || []).join(', ') || 'Unassigned')}</td>
      <td>${escapeHtml((forensicCase.linkedFolders || []).map((folder) => folder.name).join(', ') || 'No folders linked')}</td>
      <td>${forensicCase.evidenceCount || 0}</td>
      <td>
        <div class="split-actions">
          <button class="ghost-button" data-open-case-feed="${forensicCase.id}">${activityIcon()} Feed</button>
          <a class="ghost-button" href="/reports/cases/${forensicCase.id}" target="_blank">${pdfIcon()} Report</a>
          <button class="ghost-button" data-pin-case="${forensicCase.id}">${shieldIcon()} ${isPinnedCase(forensicCase.id) ? 'Pinned' : 'Pin'}</button>
          <button class="ghost-button" data-reassign-case="${forensicCase.id}">${usersIcon()} Assign Investigator</button>
        </div>
      </td>
    </tr>
  `;
}

function renderCaseCard(forensicCase) {
  return `
    <article class="case-card">
      <div class="panel-header">
        <div>
          <strong>${escapeHtml(forensicCase.caseNumber)}</strong>
          <div class="inline-note">${escapeHtml(forensicCase.title)}</div>
          <div class="inline-note">${escapeHtml(forensicCase.department)} | ${escapeHtml(forensicCase.status)}</div>
        </div>
        <span class="status-pill secure">${statusDot('Secure')} ${escapeHtml(forensicCase.evidenceCount || 0)} Evidence</span>
      </div>
      <div class="inline-note">Assigned: ${escapeHtml((forensicCase.assignedInvestigatorNames || []).join(', ') || 'Unassigned')}</div>
      <div class="inline-note">Folders: ${escapeHtml((forensicCase.linkedFolders || []).map((folder) => folder.name).join(', ') || 'No linked folders')}</div>
      <p class="muted" style="margin-top:10px">${escapeHtml(forensicCase.notes || 'No notes recorded yet.')}</p>
      <div class="split-actions" style="margin-top:12px">
        <button class="ghost-button" data-open-case-feed="${forensicCase.id}">${activityIcon()} View Feed</button>
        <a class="ghost-button" href="/reports/cases/${forensicCase.id}" target="_blank">${pdfIcon()} Open Report</a>
        <button class="ghost-button" data-pin-case="${forensicCase.id}">${shieldIcon()} ${isPinnedCase(forensicCase.id) ? 'Pinned' : 'Pin'}</button>
      </div>
    </article>
  `;
}

function renderApprovalRow(approval) {
  const approvalMeta = approvalProgressMeta(approval);
  const currentRoleApproval = approval.roleApprovals?.[currentRole()]?.decision || '';
  return `
    <tr>
      <td>${escapeHtml(approval.type)}</td>
      <td>${escapeHtml(approval.targetLabel)}</td>
      <td>${escapeHtml(approval.requestedBy)}</td>
      <td>
        <span class="status-pill ${approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'failed' : 'secure'}">${statusDot(capitalize(approval.status))} ${escapeHtml(approval.status)}</span>
        ${approvalMeta ? `<div class="inline-note">${escapeHtml(approvalMeta)}</div>` : ''}
      </td>
      <td>${formatDate(approval.requestedAt)}</td>
      <td>
        <div class="split-actions">
          ${approval.status === 'pending'
            ? `${currentRoleApproval === 'approved'
                ? `<span class="inline-note">Your role already approved</span>`
                : `<button class="ghost-button" data-approval-decision="approved" data-approval-id="${approval.id}">${shieldIcon()} Approve</button><button class="danger-button" data-approval-decision="rejected" data-approval-id="${approval.id}">${warningIcon()} Reject</button>`}`
            : `<span class="inline-note">${escapeHtml(approval.reviewedBy || 'Reviewed')}</span>`}
        </div>
      </td>
    </tr>
  `;
}

function approvalProgressMeta(approval) {
  if (approval.type !== 'delete_evidence') return '';
  const adminStatus = approval.roleApprovals?.admin?.decision === 'approved'
    ? `Admin approved by ${approval.roleApprovals.admin.by || 'Admin'}`
    : approval.roleApprovals?.admin?.decision === 'rejected'
      ? `Admin rejected by ${approval.roleApprovals.admin.by || 'Admin'}`
      : 'Admin pending';
  const supervisorStatus = approval.roleApprovals?.supervisor?.decision === 'approved'
    ? `Supervisor approved by ${approval.roleApprovals.supervisor.by || 'Supervisor'}`
    : approval.roleApprovals?.supervisor?.decision === 'rejected'
      ? `Supervisor rejected by ${approval.roleApprovals.supervisor.by || 'Supervisor'}`
      : 'Supervisor pending';
  return `${adminStatus} | ${supervisorStatus}`;
}

function renderCommentItem(comment) {
  return `
    <div class="timeline-item">
      <div class="timeline-dot success"></div>
      <div>
        <strong>${escapeHtml(comment.user)}</strong>
        <div class="muted">${escapeHtml(comment.role)} | ${formatDate(comment.timestamp)}</div>
        <div>${escapeHtml(comment.message)}</div>
      </div>
    </div>
  `;
}

function renderNotificationItem(item) {
  return `
    <div class="timeline-item">
      <div class="timeline-dot ${item.readAt ? 'success' : 'alert'}"></div>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="muted">${formatDate(item.createdAt)}</div>
        <div>${escapeHtml(item.message)}</div>
        <div class="split-actions" style="margin-top:8px">
          ${item.link ? `<a class="ghost-button" href="${escapeHtml(item.link)}" target="_blank">${previewIcon()} Open</a>` : ''}
          ${!item.readAt ? `<button class="ghost-button" data-dismiss-notification="${item.id}">${shieldIcon()} Mark Read</button>` : '<span class="inline-note">Read</span>'}
        </div>
      </div>
    </div>
  `;
}

function renderPreviewHistoryItem(item) {
  return `
    <div class="timeline-item preview-history-item">
      <div class="timeline-dot success"></div>
      <div>
        <strong>${escapeHtml(item.fileName)}</strong>
        <div class="muted">${escapeHtml(item.evidenceId)} | ${formatDate(item.timestamp)}</div>
        <button class="ghost-button" data-preview="${item.evidenceId}" style="margin-top:8px">${previewIcon()} Reopen</button>
      </div>
    </div>
  `;
}

function renderCaseFeedItem(item) {
  return `
    <div class="timeline-item">
      <div class="timeline-dot ${String(item.status).toLowerCase()}"></div>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="muted">${escapeHtml(item.user)} | ${formatDate(item.timestamp)}</div>
        <div>${escapeHtml(item.detail || '')}</div>
      </div>
    </div>
  `;
}

function renderHighlightedLogContent(content, searchTerm) {
  const lines = String(content || '').split('\n');
  return lines.map((line, index) => {
    const escaped = escapeHtml(line || ' ');
    const highlighted = searchTerm
      ? escaped.replace(new RegExp(escapeRegExp(searchTerm), 'gi'), (match) => `<mark>${match}</mark>`)
      : escaped;
    const withSyntax = highlighted
      .replace(/\b(ERROR|WARN|WARNING|CRITICAL|FAIL|FAILED)\b/gi, '<span class="log-token danger">$1</span>')
      .replace(/\b(INFO|SUCCESS|AUTHENTIC|SECURE|LOCKED)\b/gi, '<span class="log-token success">$1</span>')
      .replace(/\b(GET|POST|PUT|DELETE)\b/g, '<span class="log-token method">$1</span>');
    return `<div class="log-line"><span class="log-line-number">${index + 1}</span><code>${withSyntax}</code></div>`;
  }).join('');
}

function renderFolderRow(folder) {
  const evidenceCount = state.evidence.filter((entry) => entry.folderId === folder.id).length;
  const selected = state.selectedFolderId === folder.id;
  return `
    <tr class="${selected ? 'selected-folder-row' : ''}">
      <td>
        <strong>${escapeHtml(folder.name)}</strong>
        <div class="inline-note">${escapeHtml(folder.description || 'No description')}</div>
      </td>
      <td>
        <strong>${escapeHtml(folder.caseNumber || 'Unlinked')}</strong>
        <div class="inline-note">${escapeHtml(folder.caseTitle || 'No case linked')}</div>
      </td>
      <td><span class="status-pill ${folder.status === 'archived' ? 'failed' : 'secure'}">${statusDot(folder.status === 'archived' ? 'Failed' : 'Secure')} ${escapeHtml(folder.status)}</span></td>
      <td>${evidenceCount}</td>
      <td>
        <div class="split-actions">
          <button class="ghost-button" data-view-folder="${folder.id}">${previewIcon()} View</button>
          <button class="ghost-button" data-rename-folder="${folder.id}">${editIcon()} Rename</button>
          ${isAdmin() ? `<button class="ghost-button" data-archive-folder="${folder.id}">${folder.status === 'archived' ? archiveRestoreIcon() : archiveIcon()} ${folder.status === 'archived' ? 'Restore' : 'Archive'}</button>` : ''}
          ${isOps() ? `<button class="danger-button" data-request-approval="delete_folder" data-target-id="${folder.id}"${evidenceCount > 0 ? ' disabled' : ''}>${trashIcon()} Request Delete</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderFolderEvidenceRow(item) {
  return `
    <tr class="${item.status.toLowerCase() === 'tampered' ? 'tampered' : ''}">
      <td>
        <strong>${escapeHtml(item.fileName)}</strong>
        <div class="inline-note">${escapeHtml(item.id)}</div>
        <div class="inline-note">${escapeHtml(item.caseNumber || 'No case')} | ${escapeHtml(item.metadata?.severity || 'medium')}</div>
      </td>
      <td>${escapeHtml(item.fileType || 'Unknown')}</td>
      <td>${escapeHtml(item.uploadedBy)}</td>
      <td>${formatDate(item.uploadedAt)}</td>
      <td><span class="status-pill ${item.status.toLowerCase()}">${statusDot(item.status)} ${escapeHtml(item.status)}</span></td>
    </tr>
  `;
}

function renderInvestigatorCaseCard(item) {
  return `
    <article class="case-card ${item.status.toLowerCase() === 'tampered' ? 'tampered-card' : ''}">
      <div class="panel-header">
        <div>
          <strong>${escapeHtml(item.fileName)}</strong>
          <div class="inline-note">${escapeHtml(item.id)} | ${formatDate(item.uploadedAt)}</div>
          <div class="inline-note">${escapeHtml(item.caseNumber || 'Unlinked')} | ${escapeHtml(item.folderName || 'General Evidence')}</div>
        </div>
        <span class="status-pill ${item.status.toLowerCase()}">${statusDot(item.status)} ${escapeHtml(item.status)}</span>
      </div>
      <div class="toolbar">
        <span class="hash-pill">${escapeHtml(item.hashPreview)}</span>
        <div class="inline-note">Uploaded by ${escapeHtml(item.uploadedBy)} | ${escapeHtml(item.metadata?.severity || 'medium')} severity</div>
      </div>
      <div class="inline-note">${escapeHtml(item.metadata?.deviceSource || 'No device/source recorded')}</div>
      <div class="split-actions" style="margin-top:14px">
        <button class="ghost-button" data-preview="${item.id}">${previewIcon()} Preview</button>
        <button class="ghost-button" data-verify="${item.id}">${shieldIcon()} Verify</button>
        <button class="ghost-button" data-download="${item.id}">${downloadIcon()} Download</button>
      </div>
    </article>
  `;
}

function renderTimelineItem(log) {
  const status = String(log.status).toLowerCase();
  return `
    <div class="timeline-item">
      <div class="timeline-dot ${status}"></div>
      <div>
        <strong>${escapeHtml(log.action)}</strong>
        <div class="muted">${escapeHtml(log.user)} | ${formatDate(log.timestamp)}</div>
        <div>${escapeHtml(log.detail || '')}</div>
      </div>
    </div>
  `;
}

function navButton(section, label, icon) {
  const active = state.activeSection === section ? 'active' : '';
  return `<button class="nav-link ${active}" data-section="${section}">${icon} ${label}</button>`;
}

function renderOptions(options, selected) {
  return options
    .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${capitalize(value)}</option>`)
    .join('');
}

function renderCaseOptions(selected) {
  return state.cases
    .map((forensicCase) => `<option value="${escapeHtml(forensicCase.id)}"${forensicCase.id === selected ? ' selected' : ''}>${escapeHtml(forensicCase.caseNumber)} | ${escapeHtml(forensicCase.title)}</option>`)
    .join('');
}

function renderFolderOptions(selected) {
  return activeFolderOptions()
    .map((folder) => `<option value="${escapeHtml(folder.id)}"${folder.id === selected ? ' selected' : ''}>${escapeHtml(folder.name)}</option>`)
    .join('');
}

function recentFolderButtons() {
  const recent = getRecentFolders();
  if (!recent.length) return '<span class="inline-note">Recent folders will appear here after you open them.</span>';
  return recent
    .map((folderId) => {
      const folder = state.folders.find((entry) => entry.id === folderId);
      return folder ? `<button class="ghost-button" data-view-folder="${folder.id}">${folderIcon()} ${escapeHtml(folder.name)}</button>` : '';
    })
    .join('');
}

function activeFolderOptions() {
  return state.folders.filter((folder) => folder.status !== 'archived');
}

function pinnedCaseIds() {
  try {
    return JSON.parse(localStorage.getItem('deims_pinned_cases') || '[]');
  } catch {
    return [];
  }
}

function isPinnedCase(caseId) {
  return pinnedCaseIds().includes(caseId);
}

function togglePinnedCase(caseId) {
  const next = pinnedCaseIds();
  const index = next.indexOf(caseId);
  if (index >= 0) {
    next.splice(index, 1);
  } else {
    next.unshift(caseId);
  }
  localStorage.setItem('deims_pinned_cases', JSON.stringify(next.slice(0, 8)));
  renderShell();
}

function getRecentFolders() {
  try {
    return JSON.parse(localStorage.getItem('deims_recent_folders') || '[]');
  } catch {
    return [];
  }
}

function rememberRecentFolder(folderId) {
  const next = getRecentFolders().filter((entry) => entry !== folderId);
  next.unshift(folderId);
  localStorage.setItem('deims_recent_folders', JSON.stringify(next.slice(0, 6)));
}

function getPreviewHistory() {
  try {
    return JSON.parse(localStorage.getItem('deims_preview_history') || '[]');
  } catch {
    return [];
  }
}

function rememberPreviewHistory(evidenceId) {
  const item = state.evidence.find((entry) => entry.id === evidenceId);
  if (!item) return;
  const next = getPreviewHistory().filter((entry) => entry.evidenceId !== evidenceId);
  next.unshift({
    evidenceId,
    fileName: item.fileName,
    timestamp: new Date().toISOString()
  });
  const trimmed = next.slice(0, 8);
  localStorage.setItem('deims_preview_history', JSON.stringify(trimmed));
  state.previewHistory = trimmed;
}

function statusDot(status) {
  return `<span aria-hidden="true">${status === 'Secure' || status === 'Success' ? '●' : '●'}</span>`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shieldIcon() { return icon('<path d="M12 2l7 3v6c0 4.97-3.05 9.63-7 11-3.95-1.37-7-6.03-7-11V5l7-3z"/>'); }
function lockIcon() { return icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>'); }
function uploadIcon() { return icon('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>'); }
function recordsIcon() { return icon('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/>'); }
function auditIcon() { return icon('<path d="M12 8v5l3 3"/><path d="M12 3a9 9 0 109 9"/><path d="M18 4v4h-4"/>'); }
function dashboardIcon() { return icon('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>'); }
function warningIcon() { return icon('<path d="M12 3l10 18H2L12 3z"/><path d="M12 9v5"/><path d="M12 18h.01"/>'); }
function userIcon() { return icon('<path d="M20 21a8 8 0 10-16 0"/><circle cx="12" cy="7" r="4"/>'); }
function moonIcon() { return icon('<path d="M20 14.5A7.5 7.5 0 1112.5 5 6 6 0 0020 14.5z"/>'); }
function logoutIcon() { return icon('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'); }
function activityIcon() { return icon('<path d="M3 12h4l2-5 4 10 2-5h6"/>'); }
function pdfIcon() { return icon('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M8 15h1.5a1.5 1.5 0 010 3H8v-3z"/><path d="M12 18v-3h1.5"/><path d="M12 16.5h1.2"/><path d="M16 18v-3h2"/>'); }
function refreshIcon() { return icon('<path d="M3 12a9 9 0 0115.55-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15.55 6.36L3 16"/><path d="M8 16H3v5"/>'); }
function filterIcon() { return icon('<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>'); }
function previewIcon() { return icon('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>'); }
function eyeIcon() { return icon('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>'); }
function eyeOffIcon() { return icon('<path d="M3 3l18 18"/><path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58"/><path d="M9.88 5.09A10.94 10.94 0 0112 5c6.5 0 10 7 10 7a17.7 17.7 0 01-4.24 4.81"/><path d="M6.61 6.61A17.34 17.34 0 002 12s3.5 7 10 7a10.56 10.56 0 005.39-1.61"/>'); }
function downloadIcon() { return icon('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'); }
function forensicsIcon() { return icon('<path d="M10 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-5"/><path d="M14 3h7v7"/><path d="M10 14L21 3"/><circle cx="9" cy="9" r="2"/>'); }
function commandIcon() { return icon('<path d="M4 19h16"/><path d="M6 17V9l6-4 6 4v8"/><path d="M9 13h6"/><path d="M10 9h4"/>'); }
function caseIcon() { return icon('<path d="M4 20h16"/><path d="M7 20v-8l5-7 5 7v8"/><path d="M10 14h4"/><path d="M11 10h2"/>'); }
function usersIcon() { return icon('<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'); }
function trashIcon() { return icon('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'); }
function folderIcon() { return icon('<path d="M3 7h5l2 2h11v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/><path d="M3 7a2 2 0 012-2h4l2 2"/>'); }
function editIcon() { return icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>'); }
function archiveIcon() { return icon('<path d="M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>'); }
function archiveRestoreIcon() { return icon('<path d="M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8"/><path d="M1 3h22v5H1z"/><path d="M12 17v-6"/><path d="M9 14l3-3 3 3"/>'); }

function icon(paths) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
