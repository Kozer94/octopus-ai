const HUD_WS_URL = 'ws://localhost:3002';
const RECONNECT_DELAY = 3000;
const MAX_LOG_LINES = 200;

let ws = null;
let reconnectTimer = null;
let isConnected = false;

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

const handlers = {
  onLog: () => {},
  onHistory: () => {},
  onPluginUpdate: () => {},
  onProviderUpdate: () => {},
  onConnect: () => {},
  onDisconnect: () => {},
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function updateStatusBadge(connected) {
  const badge = document.getElementById('ai-status');
  if (!badge) return;
  badge.textContent = connected ? 'Live logs connected' : 'Live logs reconnecting';
  badge.className = `badge ${connected ? 'live' : 'offline'}`;
}

function appendLog(entry) {
  const container = document.getElementById('log-list');
  if (!container) return;

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="log-tag ${escapeHtml(entry.tag || 'info')}">${escapeHtml(entry.tag || 'info')}</span>
    <span>${escapeHtml(entry.msg || '')}</span>
    <span class="log-time">${escapeHtml(entry.time || '')}</span>
  `;

  container.appendChild(line);
  while (container.children.length > MAX_LOG_LINES) {
    container.firstElementChild?.remove();
  }
  container.scrollTop = container.scrollHeight;
}

function updatePlugin(data) {
  const card = document.querySelector(`[data-plugin-id="${CSS.escape(data.pluginId)}"]`);
  if (!card) return;

  const badge = card.querySelector('.badge');
  if (badge) {
    badge.className = `badge ${data.status === 'ok' ? 'ok' : 'critical'}`;
    badge.textContent = data.status === 'ok' ? 'OK' : 'Error';
  }
}

function updateProvider(data) {
  const card = document.querySelector(`[data-provider="${CSS.escape(data.providerName)}"]`);
  if (!card) return;

  const badge = card.querySelector('.badge');
  if (badge) {
    const map = { active: 'ok', 'no-key': 'critical', offline: 'major', error: 'major' };
    badge.className = `badge ${map[data.status] || 'major'}`;
    badge.textContent = data.status;
  }
}

function dispatch(message) {
  if (message.type === 'log') {
    appendLog(message.entry);
    handlers.onLog(message.entry);
  } else if (message.type === 'history') {
    const logs = Array.isArray(message.logs) ? message.logs : [];
    logs.forEach(appendLog);
    handlers.onHistory(logs);
  } else if (message.type === 'plugin_update') {
    updatePlugin(message);
    handlers.onPluginUpdate(message);
  } else if (message.type === 'provider_update') {
    updateProvider(message);
    handlers.onProviderUpdate(message);
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
}

function connect() {
  if (ws && ws.readyState <= 1) return;

  ws = new WebSocket(HUD_WS_URL);
  ws.onopen = () => {
    isConnected = true;
    clearTimeout(reconnectTimer);
    updateStatusBadge(true);
    handlers.onConnect();
    console.log('[HUD-WS] connected to ws://localhost:3002');
  };
  ws.onmessage = event => {
    try {
      dispatch(JSON.parse(event.data));
    } catch (error) {
      console.warn('[HUD-WS] parse error:', error);
    }
  };
  ws.onclose = () => {
    isConnected = false;
    updateStatusBadge(false);
    handlers.onDisconnect();
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws?.close();
  };
}

function disconnect() {
  clearTimeout(reconnectTimer);
  ws?.close();
}

function cap(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collectAffectedElements(issue, limit = 5) {
  const examples = Array.isArray(issue.examples) ? issue.examples : [];
  return examples.slice(0, limit).map(example => ({
    tag: String(example.tagName || example.tag || 'element').slice(0, 40),
    className: String(example.className || '').slice(0, 200),
    inlineStyle: example.style ? JSON.stringify(example.style).slice(0, 300) : '',
    textContent: String(example.text || example.textContent || '').slice(0, 120),
    rect: example.rect || null,
  }));
}

async function requestAIFix(issue) {
  const elements = collectAffectedElements(issue);
  const response = await fetch('http://localhost:3001/api/hud/ai-fix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Octopus-Token': window.__OCTOPUS_TOKEN__ || localStorage.getItem('octopusApiToken') || '',
    },
    body: JSON.stringify({
      ruleId: issue.id,
      severity: issue.severity,
      description: issue.message,
      affected: issue.count || 0,
      elements,
      pageContext: {
        url: window.location.href,
        title: document.title,
      },
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'AI fix failed');
  return data;
}

async function applyPatchToFile(ruleId, patch, targetFile) {
  const token = localStorage.getItem('octopusApiToken') || '';
  const response = await fetch('http://localhost:3001/api/hud/apply-patch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Octopus-Token': token,
    },
    body: JSON.stringify({ ruleId, patch, targetFile }),
  });
  return response.json();
}

function applyPatchLive(code) {
  if (typeof code !== 'string' || !code.trim()) {
    window.__OCTOPUS_LAST_PATCH__ = {
      status: 'skipped',
      source: 'hud-preview',
      changed: false,
      code: '',
      message: 'Patch preview skipped because no code was provided.',
      at: new Date().toISOString(),
    };
    return window.__OCTOPUS_LAST_PATCH__;
  }
  try {
    const patch = {
      status: 'applied',
      source: 'hud-preview',
      changed: true,
      code,
      message: 'Patch preview applied to the live page.',
      at: new Date().toISOString(),
    };
    const ch = new BroadcastChannel('octopus-audit-hud');
    ch.postMessage({ type: 'css-patch-apply', code, patch });
    ch.close();
    window.__OCTOPUS_LAST_PATCH__ = patch;
    return patch;
  } catch {
    window.__OCTOPUS_LAST_PATCH__ = {
      status: 'skipped',
      source: 'hud-preview',
      changed: false,
      code,
      message: 'Patch preview skipped because the live channel is unavailable.',
      at: new Date().toISOString(),
    };
    return window.__OCTOPUS_LAST_PATCH__;
  }
}

const HudWS = {
  connect,
  disconnect,
  on(event, fn) {
    const key = `on${cap(event)}`;
    if (key in handlers && typeof fn === 'function') handlers[key] = fn;
  },
  get connected() {
    return isConnected;
  },
  requestAIFix,
  applyPatchLive,
  applyPatchToFile,
};

window.HudWS = HudWS;
ensureLastPatchState('hud');
setTimeout(connect, 500);
