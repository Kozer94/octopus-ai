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
  runtimeErrors: document.querySelector('#runtimeErrors'),
  runtimeSummary: document.querySelector('#runtimeSummary'),
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
let runtimePollTimer = null;
let runtimePollBackoffUntil = 0;
const ENGINEER_MEMORY_KEY = 'octopus-engineer-hud-memory';
const SEVERITY_WEIGHT = { critical: 0, major: 1, minor: 2, info: 3 };
const CLIENT_EVENT_LIMIT = 80;
const RUNTIME_POLL_INTERVAL_MS = 5000;
const RUNTIME_POLL_BACKOFF_MS = 30000;
const RUNTIME_VISIBLE_TYPES = new Set([
  'client.console.error',
  'client.console.warning',
  'client.error',
  'client.network.error',
  'client.network.warning',
  'client.promise.unhandled',
  'client.react.error',
  'client.resource.error',
]);

function ensureLastPatchState(source = 'hud') {
  if (!window.__OCTOPUS_LAST_PATCH__) {
    window.__OCTOPUS_LAST_PATCH__ = {
      status: 'skipped',
      source,
      changed: false,
      message: 'No patch operation has run yet.',
      at: new Date().toISOString(),
    };
  }
}

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

function getApiToken() {
  return window.__OCTOPUS_TOKEN__ || localStorage.getItem('octopusApiToken') || '';
}

function getEventSeverity(event) {
  return event?.severity || event?.metadata?.severity || 'info';
}

function formatRuntimeType(type = '') {
  return type.replace(/^client\./, '').replaceAll('.', ' ');
}

function shortUrl(value = '') {
  const text = String(value || '');
  try {
    const url = new URL(text, window.location.href);
    return `${url.pathname}${url.search}`;
  } catch {
    return text.replace(/^https?:\/\/[^/]+/, '') || text;
  }
}

function parseStackLocation(stack = '') {
  const lines = String(stack || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/(?:\(|\s)(https?:\/\/[^)\s]+):(\d+):(\d+)\)?/);
    if (match) {
      return {
        file: shortUrl(match[1]),
        line: match[2],
        column: match[3],
      };
    }
  }
  return null;
}

function getRuntimeLocation(event) {
  const payload = event?.payload || {};
  if (payload.filename || payload.line || payload.column) {
    return {
      file: shortUrl(payload.filename || payload.url || ''),
      line: payload.line || '',
      column: payload.column || '',
    };
  }
  return parseStackLocation(payload.error?.stack || payload.callStack || payload.componentStack || '');
}

function getRuntimeMessage(event) {
  const payload = event?.payload || {};
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return payload.message;
  if (payload.status) return `${payload.status} ${payload.statusText || ''}`.trim();
  if (Array.isArray(payload.args)) {
    return payload.args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (arg?.message) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');
  }
  if (payload.target?.selector) return `Resource failed: ${payload.target.selector}`;
  return 'Runtime event captured';
}

function getRuntimeStack(event) {
  const payload = event?.payload || {};
  return payload.error?.stack || payload.callStack || payload.componentStack || '';
}

function renderBreadcrumbs(breadcrumbs = []) {
  const relevant = breadcrumbs
    .filter(item => item.kind === 'click' || item.kind === 'fetch' || item.kind === 'resource-error')
    .slice(-6);
  if (relevant.length === 0) return '';
  return relevant.map(item => {
    const data = item.data || {};
    if (item.kind === 'click') {
      return `${new Date(item.at).toLocaleTimeString()} click ${data.target?.selector || data.target?.tag || 'element'} ${data.target?.text || ''}`.trim();
    }
    if (item.kind === 'fetch') {
      return `${new Date(item.at).toLocaleTimeString()} fetch ${data.method || 'GET'} ${shortUrl(data.url || '')}`;
    }
    return `${new Date(item.at).toLocaleTimeString()} ${item.kind} ${data.target?.selector || ''}`.trim();
  }).join('\n');
}

function normalizeUxStatus(value, fallback = 'success') {
  const status = String(value || fallback).toLowerCase();
  if (['success', 'applied', 'skipped'].includes(status)) return status;
  if (['added', 'appended', 'replaced', 'changed'].includes(status)) return 'applied';
  if (['noop', 'no-op', 'unchanged'].includes(status)) return 'skipped';
  return fallback;
}

function formatUxStatus(status) {
  const normalized = normalizeUxStatus(status);
  const labels = {
    success: 'Success',
    applied: 'Applied',
    skipped: 'Skipped',
  };
  return labels[normalized];
}

function renderStatusBadge(status, message = '') {
  const normalized = normalizeUxStatus(status);
  const title = message ? ` title="${escapeHtml(message)}"` : '';
  return `<span class="badge status-${escapeHtml(normalized)}"${title}>${escapeHtml(formatUxStatus(normalized))}</span>`;
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
      ${issue.aiResult ? renderPatchPreview(issue.aiResult, issue.key) : ''}
    </article>
  `).join('');
}

function renderPatchPreview(result, issueKey) {
  const confidence = result.confidence || 'low';
  const confidenceClass = confidence === 'high' ? 'ok' : confidence === 'medium' ? 'minor' : 'major';
  const patch = result.patch || {};
  const code = escapeHtml(patch.code || '/* No code provided */');
  const analysis = escapeHtml(result.analysis || '');
  const savedTo = result.savedTo || '';
  const fileAction = result.fileAction || '';
  const filePreview = result.filePreview || '';
  const operationStatus = result.fileStatus || result.previewStatus || result.status || 'success';
  const operationMessage = result.fileMessage || result.previewMessage || result.message || '';
  return `
    <div class="ai-patch-preview">
      <div class="ai-patch-header">
        <span class="ai-patch-label">Groq AI Fix</span>
        <div class="badge-row">
          ${renderStatusBadge(operationStatus, operationMessage)}
          <span class="badge ${escapeHtml(confidenceClass)}">${escapeHtml(confidence)} confidence</span>
        </div>
      </div>
      ${analysis ? `<p class="ai-analysis">${analysis}</p>` : ''}
      <pre class="ai-patch-code">${code}</pre>
      ${operationMessage ? `<p class="ai-analysis">${escapeHtml(operationMessage)}</p>` : ''}
      ${savedTo ? `<p class="ai-analysis">Target <code>${escapeHtml(savedTo)}</code> <span class="badge status-applied">${escapeHtml(fileAction || 'applied')}</span></p>` : ''}
      ${filePreview ? `<pre class="ai-patch-code">${escapeHtml(filePreview)}</pre>` : ''}
      <div class="ai-patch-actions">
        <button type="button" data-action="patch-apply" data-key="${escapeHtml(issueKey)}">Preview</button>
        <button type="button" data-action="patch-save" data-key="${escapeHtml(issueKey)}"${savedTo ? ' disabled' : ''}>${savedTo ? formatUxStatus(operationStatus) : 'Apply to file'}</button>
        <button type="button" data-action="patch-copy" data-key="${escapeHtml(issueKey)}">Copy</button>
      </div>
    </div>
  `;
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

function renderRuntimeErrors(events = []) {
  const runtimeEvents = events
    .filter(event => RUNTIME_VISIBLE_TYPES.has(event.type))
    .filter(event => ['warning', 'error', 'critical'].includes(getEventSeverity(event)))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 20);

  const critical = runtimeEvents.filter(event => getEventSeverity(event) === 'critical').length;
  const errors = runtimeEvents.filter(event => getEventSeverity(event) === 'error').length;
  const warnings = runtimeEvents.filter(event => getEventSeverity(event) === 'warning').length;
  elements.runtimeSummary.textContent = `${runtimeEvents.length} shown / ${critical} critical / ${errors} errors / ${warnings} warnings`;

  if (runtimeEvents.length === 0) {
    elements.runtimeErrors.innerHTML = '<div class="empty">No runtime warnings or errors captured yet. Use the app, then press Refresh.</div>';
    return;
  }

  elements.runtimeErrors.innerHTML = runtimeEvents.map(event => {
    const severity = getEventSeverity(event);
    const payload = event.payload || {};
    const location = getRuntimeLocation(event);
    const stack = getRuntimeStack(event);
    const breadcrumbs = renderBreadcrumbs(payload.breadcrumbs || []);
    const status = payload.status ? `<span>Status ${escapeHtml(payload.status)}</span>` : '';
    const url = payload.url ? `<span>${escapeHtml(shortUrl(payload.url))}</span>` : '';
    const file = location?.file ? `<span>File ${escapeHtml(location.file)}</span>` : '<span>File unknown</span>';
    const line = location?.line ? `<span>Line ${escapeHtml(location.line)}</span>` : '<span>Line unknown</span>';
    const column = location?.column ? `<span>Column ${escapeHtml(location.column)}</span>` : '';

    return `
      <article class="issue runtime-card ${escapeHtml(severity)}">
        <div class="issue-title">
          <h2>${escapeHtml(formatRuntimeType(event.type))}</h2>
          <div class="badge-row">
            <span class="badge source">client</span>
            <span class="badge ${escapeHtml(severity)}">${escapeHtml(severity)}</span>
          </div>
        </div>
        <p>${escapeHtml(getRuntimeMessage(event))}</p>
        <div class="runtime-location">
          ${file}
          ${line}
          ${column}
          ${status}
          ${url}
        </div>
        ${breadcrumbs ? `<pre class="runtime-breadcrumbs">${escapeHtml(breadcrumbs)}</pre>` : ''}
        ${stack ? `<pre class="runtime-stack">${escapeHtml(stack)}</pre>` : ''}
      </article>
    `;
  }).join('');
}

async function refreshRuntimeErrors() {
  if (!elements.runtimeErrors) return;
  if (Date.now() < runtimePollBackoffUntil) return;
  try {
    const response = await fetch(`http://localhost:3001/api/events?category=client&limit=${CLIENT_EVENT_LIMIT}`, {
      headers: {
        'X-Octopus-Token': getApiToken(),
      },
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
    runtimePollBackoffUntil = 0;
    renderRuntimeErrors(data.events || []);
  } catch (error) {
    if (/429|طلبات كثيرة|Too Many Requests/i.test(error.message || '')) {
      runtimePollBackoffUntil = Date.now() + RUNTIME_POLL_BACKOFF_MS;
    }
    elements.runtimeSummary.textContent = 'Unavailable';
    elements.runtimeErrors.innerHTML = `<div class="empty">Could not load runtime errors: ${escapeHtml(error.message)}</div>`;
  }
}

function requestUpdate() {
  render(readStoredPayload());
  renderDomAudit(readStoredDomPayload());
  refreshRuntimeErrors();
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
window.__HUD_EVENTS_INSTANCES__ = window.__HUD_EVENTS_INSTANCES__ || {
  runtimePollTimer: null,
  startedAt: null,
  starts: 0,
};
if (window.__HUD_EVENTS_INSTANCES__.runtimePollTimer) {
  clearInterval(window.__HUD_EVENTS_INSTANCES__.runtimePollTimer);
}
runtimePollTimer = setInterval(refreshRuntimeErrors, RUNTIME_POLL_INTERVAL_MS);
window.__HUD_EVENTS_INSTANCES__.runtimePollTimer = runtimePollTimer;
window.__HUD_EVENTS_INSTANCES__.startedAt = new Date().toISOString();
window.__HUD_EVENTS_INSTANCES__.starts += 1;
window.addEventListener('beforeunload', () => {
  clearInterval(runtimePollTimer);
  if (window.__HUD_EVENTS_INSTANCES__?.runtimePollTimer === runtimePollTimer) {
    window.__HUD_EVENTS_INSTANCES__.runtimePollTimer = null;
  }
});
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
    button.textContent = 'Analyzing...';
    try {
      const result = await window.HudWS.requestAIFix(issue);
      window.__OCTOPUS_LAST_PATCH__ = {
        status: normalizeUxStatus(result.status, 'success'),
        source: 'hud-ai-fix',
        changed: false,
        ruleId: issue.id,
        issueKey: issue.key,
        patch: result.patch || null,
        message: result.fallback ? 'Fallback patch generated successfully.' : 'Patch proposal generated successfully.',
        at: new Date().toISOString(),
      };
      const nextMemory = readEngineerMemory();
      nextMemory[issue.key] = {
        ...issue,
        aiResult: {
          ...result,
          status: normalizeUxStatus(result.status, 'success'),
          message: result.fallback ? 'Fallback patch generated successfully.' : 'Patch proposal generated successfully.',
        },
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

  if (button.dataset.action === 'patch-copy') {
    const code = issue.aiResult?.patch?.code || '';
    await navigator.clipboard?.writeText(code);
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = 'Copy'; }, 900);
  }

  if (button.dataset.action === 'patch-apply') {
    const code = issue.aiResult?.patch?.code || '';
    const result = window.HudWS?.applyPatchLive(code) || {
      status: 'skipped',
      message: 'Live preview channel is unavailable.',
    };
    window.__OCTOPUS_LAST_PATCH__ = {
      ...result,
      source: 'hud-preview',
      ruleId: issue.id,
      issueKey: issue.key,
      code,
      at: new Date().toISOString(),
    };
    const nextMemory = readEngineerMemory();
    nextMemory[issue.key] = {
      ...issue,
      aiResult: {
        ...issue.aiResult,
        previewStatus: normalizeUxStatus(result.status, 'skipped'),
        previewMessage: result.message || '',
        previewedAt: Date.now(),
      },
    };
    writeEngineerMemory(nextMemory);
    lastEngineerSyncToken = getEngineerScanToken();
    renderEngineerQueue();
    button.textContent = formatUxStatus(result.status);
    setTimeout(() => { button.textContent = 'Preview'; }, 1500);
  }

  if (button.dataset.action === 'patch-save') {
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const patch = issue.aiResult?.patch || {};
      const targetFile = patch.targetFile || 'client/src/index.css';
      const result = await window.HudWS.applyPatchToFile(issue.id, patch, targetFile);
      if (!result.success) throw new Error(result.error || 'Apply failed');
      const status = normalizeUxStatus(result.status || result.action, result.changed ? 'applied' : 'skipped');
      window.__OCTOPUS_LAST_PATCH__ = {
        status,
        source: 'hud-file-apply',
        changed: result.changed === true,
        ruleId: issue.id,
        issueKey: issue.key,
        targetFile,
        action: result.action || '',
        patch,
        preview: result.preview || '',
        message: result.message || '',
        at: new Date().toISOString(),
      };

      const nextMemory = readEngineerMemory();
      nextMemory[issue.key] = {
        ...issue,
        aiResult: {
          ...issue.aiResult,
          savedTo: status === 'applied' ? targetFile : '',
          fileStatus: status,
          fileAction: result.action || '',
          fileMessage: result.message || '',
          filePreview: result.preview || '',
          savedAt: Date.now(),
        },
      };
      writeEngineerMemory(nextMemory);
      lastEngineerSyncToken = getEngineerScanToken();
      renderEngineerQueue();
    } catch (error) {
      window.__OCTOPUS_LAST_PATCH__ = {
        status: 'skipped',
        source: 'hud-file-apply',
        changed: false,
        ruleId: issue.id,
        issueKey: issue.key,
        error: error.message,
        message: 'Patch file apply was skipped because the request failed.',
        at: new Date().toISOString(),
      };
      button.textContent = 'Skipped';
      button.title = error.message;
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Apply to file';
      }, 1500);
    }
  }
});
requestUpdate();
ensureLastPatchState('hud');
