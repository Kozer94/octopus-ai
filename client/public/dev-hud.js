const elements = {
  passed: document.querySelector('#passedCount'),
  critical: document.querySelector('#criticalCount'),
  major: document.querySelector('#majorCount'),
  minor: document.querySelector('#minorCount'),
  lastScan: document.querySelector('#lastScan'),
  viewport: document.querySelector('#viewport'),
  issues: document.querySelector('#issues'),
  engineerIssues: document.querySelector('#engineerIssues'),
  engineerSummary: document.querySelector('#engineerSummary'),
  domIssues: document.querySelector('#domIssues'),
  domSummary: document.querySelector('#domSummary'),
  refresh: document.querySelector('#refreshBtn'),
  domAudit: document.querySelector('#domAuditBtn'),
  domFix: document.querySelector('#domFixBtn'),
};

let channel = null;
let latestLayoutPayload = null;
let latestDomPayload = null;
let engineerMemoryCache = null;
let lastEngineerSyncToken = '';
let domAuditPending = false;
const ENGINEER_MEMORY_KEY = 'octopus-engineer-hud-memory';
const SEVERITY_WEIGHT = { critical: 0, major: 1, minor: 2, info: 3 };

function readStoredPayload() {
  try {
    const raw = localStorage.getItem('octopus-audit-hud');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredDomPayload() {
  try {
    const raw = localStorage.getItem('octopus-dom-audit-hud');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readEngineerMemory() {
  try {
    const raw = localStorage.getItem(ENGINEER_MEMORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeEngineerMemory(memory) {
  try {
    localStorage.setItem(ENGINEER_MEMORY_KEY, JSON.stringify(memory));
    engineerMemoryCache = memory;
  } catch { /* ignore localStorage failures */ }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeIssue(source, result, scanToken) {
  const id = result.id || result.ruleId || 'UNKNOWN';
  const severity = result.severity || 'minor';
  const message = result.message || '';
  const fix = result.fix || '';
  return {
    key: `${source}:${id}`,
    source,
    id,
    severity,
    message,
    fix,
    count: result.count,
    examples: Array.isArray(result.examples) ? result.examples : [],
    autoFixed: result.autoFixed === true,
    scanToken,
  };
}

function getCurrentIssues(layoutPayload, domPayload) {
  const layoutResults = Array.isArray(layoutPayload?.results) ? layoutPayload.results : [];
  const domIssues = Array.isArray(domPayload?.issues) ? domPayload.issues : [];
  return [
    ...layoutResults.filter(result => result?.violated).map(result => normalizeIssue('layout', result, layoutPayload?.lastRun || 0)),
    ...domIssues.map(result => normalizeIssue('dom', result, domPayload?.lastRun || 0)),
  ];
}

function getEngineerScanToken() {
  return `${latestLayoutPayload?.lastRun || 0}:${latestDomPayload?.lastRun || 0}`;
}

function syncEngineerMemory() {
  const scanToken = getEngineerScanToken();
  if (engineerMemoryCache && scanToken === lastEngineerSyncToken) {
    return engineerMemoryCache;
  }

  const memory = engineerMemoryCache || readEngineerMemory();
  const now = Date.now();
  const activeIssues = getCurrentIssues(latestLayoutPayload, latestDomPayload);
  const activeKeys = new Set(activeIssues.map(issue => issue.key));

  for (const issue of activeIssues) {
    const previous = memory[issue.key];
    const returned = previous?.status === 'fixed' || previous?.status === 'cleared';
    const isNewScan = previous?.scanToken !== issue.scanToken;
    memory[issue.key] = {
      ...previous,
      ...issue,
      firstSeen: previous?.firstSeen || now,
      lastSeen: now,
      seenCount: (previous?.seenCount || 0) + (isNewScan ? 1 : 0),
      status: returned ? 'returned' : (previous?.status || 'new'),
    };
  }

  for (const [key, issue] of Object.entries(memory)) {
    if (!activeKeys.has(key) && issue.status !== 'fixed' && issue.status !== 'cleared') {
      memory[key] = {
        ...issue,
        status: 'cleared',
        clearedAt: now,
      };
    }
  }

  lastEngineerSyncToken = scanToken;
  writeEngineerMemory(memory);
  return memory;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'unknown';
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function renderEngineerQueue() {
  const memory = syncEngineerMemory();
  const issues = Object.values(memory)
    .filter(issue => issue.status !== 'fixed' && issue.status !== 'cleared')
    .sort((a, b) => {
      const statusA = a.status === 'returned' ? -1 : 0;
      const statusB = b.status === 'returned' ? -1 : 0;
      return statusA - statusB ||
        (SEVERITY_WEIGHT[a.severity] ?? 9) - (SEVERITY_WEIGHT[b.severity] ?? 9) ||
        (b.lastSeen || 0) - (a.lastSeen || 0);
    });

  const allIssues = Object.values(memory).filter(issue => issue.status !== 'fixed');
  const active = issues;
  const returned = issues.filter(issue => issue.status === 'returned').length;
  const cleared = allIssues.filter(issue => issue.status === 'cleared').length;
  elements.engineerSummary.textContent = `${active.length} active / ${returned} returned / ${cleared} cleared`;

  if (issues.length === 0) {
    elements.engineerIssues.innerHTML = cleared > 0
      ? `<div class="empty">${cleared} cleared issue(s) hidden. Active queue is clean.</div>`
      : '<div class="empty">No tracked issues yet. Run an audit to start the desk.</div>';
    return;
  }

  elements.engineerIssues.innerHTML = issues.map(issue => `
    <article class="issue engineer-card ${escapeHtml(issue.status || 'new')}">
      <div class="issue-title">
        <h2>${escapeHtml(issue.id)}</h2>
        <div class="badge-row">
          <span class="badge source">${escapeHtml(issue.source)}</span>
          <span class="badge status-${escapeHtml(issue.status || 'new')}">${escapeHtml(issue.status || 'new')}</span>
          <span class="badge ${escapeHtml(issue.severity || 'minor')}">${escapeHtml(issue.severity || 'minor')}</span>
        </div>
      </div>
      <p>${escapeHtml(issue.message)}</p>
      <p>${escapeHtml(issue.fix)}</p>
      <div class="issue-meta">
        <span>Seen ${escapeHtml(issue.seenCount || 1)}x</span>
        <span>Last ${escapeHtml(formatRelativeTime(issue.lastSeen))}</span>
      </div>
      <div class="issue-actions">
        <button type="button" data-action="seen" data-key="${escapeHtml(issue.key)}">Mark Seen</button>
        <button type="button" data-action="fixed" data-key="${escapeHtml(issue.key)}">Mark Fixed</button>
        <button type="button" data-action="copy" data-key="${escapeHtml(issue.key)}">Copy Fix</button>
        <button type="button" data-action="ai-fix" data-key="${escapeHtml(issue.key)}">AI Fix</button>
      </div>
      ${issue.aiProposal ? `<pre class="ai-proposal">${escapeHtml(formatProposal(issue.aiProposal))}</pre>` : ''}
    </article>
  `).join('');
}

function formatProposal(proposal) {
  if (typeof proposal === 'string') return proposal;
  return JSON.stringify(proposal, null, 2);
}

function setDomAuditBusy(isBusy) {
  domAuditPending = isBusy;
  elements.domAudit.disabled = isBusy;
  elements.domFix.disabled = isBusy;
  elements.domAudit.textContent = isBusy ? 'Running...' : 'Run DOM Audit';
  elements.domFix.textContent = isBusy ? 'Running...' : 'Run + Auto-Fix';
}

function render(payload) {
  latestLayoutPayload = payload;
  if (!payload) {
    elements.issues.innerHTML = '<div class="empty">Open the Octopus app in development mode, then press Refresh.</div>';
    renderEngineerQueue();
    return;
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const violated = results.filter(result => result?.violated);

  elements.passed.textContent = payload.passed ?? Math.max(0, results.length - violated.length);
  elements.critical.textContent = payload.critical ?? violated.filter(result => result.severity === 'critical').length;
  elements.major.textContent = payload.major ?? violated.filter(result => result.severity === 'major').length;
  elements.minor.textContent = payload.minor ?? violated.filter(result => result.severity === 'minor').length;
  elements.lastScan.textContent = payload.lastScan ? `Last scan: ${payload.lastScan}` : 'Last scan unknown';
  elements.viewport.textContent = payload.viewportWidth && payload.viewportHeight
    ? `Viewport: ${payload.viewportWidth} x ${payload.viewportHeight}`
    : 'Viewport unknown';

  if (violated.length === 0) {
    elements.issues.innerHTML = '<div class="empty">All layout checks passed.</div>';
    renderEngineerQueue();
    return;
  }

  elements.issues.innerHTML = violated.map(result => `
    <article class="issue">
      <div class="issue-title">
        <h2>${escapeHtml(result.id || 'Unknown issue')}</h2>
        <span class="badge ${escapeHtml(result.severity || 'minor')}">${escapeHtml(result.severity || 'minor')}</span>
      </div>
      <p>${escapeHtml(result.message || '')}</p>
      <p>${escapeHtml(result.fix || '')}</p>
    </article>
  `).join('');
  renderEngineerQueue();
}

function renderDomAudit(payload) {
  setDomAuditBusy(false);
  latestDomPayload = payload;
  if (!payload) {
    elements.domSummary.textContent = 'Waiting';
    elements.domIssues.innerHTML = '<div class="empty">Press Run DOM Audit while the Octopus app is open.</div>';
    renderEngineerQueue();
    return;
  }

  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  const stats = payload.stats || {};
  elements.domSummary.textContent = `${stats.passed ?? 0} passed / ${issues.length} issues / ${stats.fixed ?? 0} fixed`;

  if (issues.length === 0) {
    elements.domIssues.innerHTML = '<div class="empty">DOM audit passed.</div>';
    renderEngineerQueue();
    return;
  }

  elements.domIssues.innerHTML = issues.map(result => `
    <article class="issue">
      <div class="issue-title">
        <h2>${escapeHtml(result.id || 'Unknown rule')}</h2>
        <span class="badge ${escapeHtml(result.severity || 'minor')}">${escapeHtml(result.autoFixed ? 'fixed' : result.severity || 'minor')}</span>
      </div>
      <p>${escapeHtml(result.message || '')}</p>
      <p>${escapeHtml(result.fix || '')}</p>
      <p>${escapeHtml(result.count || 0)} element(s)</p>
    </article>
  `).join('');
  renderEngineerQueue();
}

function requestUpdate() {
  render(readStoredPayload());
  renderDomAudit(readStoredDomPayload());
  channel?.postMessage({ type: 'audit-request' });
}

function requestDomAudit(autoFix = false) {
  if (domAuditPending) return;
  setDomAuditBusy(true);
  elements.domSummary.textContent = autoFix ? 'Auto-fix running...' : 'Audit running...';
  channel?.postMessage({ type: 'dom-audit-request', autoFix });
  setTimeout(() => setDomAuditBusy(false), 3000);
}

if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('octopus-audit-hud');
  channel.onmessage = (event) => {
    if (event.data?.type === 'audit-update') render(event.data.payload);
    if (event.data?.type === 'dom-audit-update') renderDomAudit(event.data.payload);
  };
}

elements.refresh.addEventListener('click', requestUpdate);
elements.domAudit.addEventListener('click', () => requestDomAudit(false));
elements.domFix.addEventListener('click', () => requestDomAudit(true));
elements.engineerIssues.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const memory = readEngineerMemory();
  const issue = memory[button.dataset.key];
  if (!issue) return;

  if (button.dataset.action === 'seen') {
    memory[issue.key] = { ...issue, status: 'seen', acknowledgedAt: Date.now() };
    writeEngineerMemory(memory);
    lastEngineerSyncToken = getEngineerScanToken();
    renderEngineerQueue();
  }

  if (button.dataset.action === 'fixed') {
    memory[issue.key] = { ...issue, status: 'fixed', fixedAt: Date.now() };
    writeEngineerMemory(memory);
    lastEngineerSyncToken = getEngineerScanToken();
    renderEngineerQueue();
  }

  if (button.dataset.action === 'copy') {
    const text = `${issue.id}\n${issue.message}\nFix: ${issue.fix}`;
    await navigator.clipboard?.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy Fix'; }, 900);
  }

  if (button.dataset.action === 'ai-fix') {
    button.disabled = true;
    button.textContent = 'Thinking...';
    try {
      const response = await fetch('/api/hud/ai-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'AI fix failed');
      const nextMemory = readEngineerMemory();
      nextMemory[issue.key] = {
        ...issue,
        aiProposal: data.proposal,
        aiCandidates: data.candidates || [],
        aiProposedAt: Date.now(),
      };
      writeEngineerMemory(nextMemory);
      lastEngineerSyncToken = getEngineerScanToken();
      renderEngineerQueue();
    } catch (error) {
      button.textContent = 'Failed';
      button.title = error.message;
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'AI Fix';
      }, 1500);
    }
  }
});
requestUpdate();
