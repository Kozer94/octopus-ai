const HUD_WS_URL = 'ws://localhost:3002';
const RECONNECT_DELAY = 3000;
const MAX_LOG_LINES = 200;

let ws = null;
let reconnectTimer = null;
let isConnected = false;

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
};

window.HudWS = HudWS;
setTimeout(connect, 500);
