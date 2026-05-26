const { WebSocketServer } = require('ws');

let wss = null;
const MAX_HISTORY = 200;
const logHistory = [];

function broadcast(payload) {
  if (!wss) return;
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}

function initHudWS({ port = 3002 } = {}) {
  if (wss) return wss;

  wss = new WebSocketServer({ port });
  wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'history', logs: logHistory }));
    ws.on('error', () => {});
  });

  console.log(`🔌 HUD WebSocket شغّال على ws://localhost:${port}`);
  return wss;
}

function hudLog(tag, msg, extra = {}) {
  const entry = {
    tag,
    msg,
    time: new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
    ts: Date.now(),
    ...extra,
  };

  logHistory.push(entry);
  if (logHistory.length > MAX_HISTORY) logHistory.shift();

  broadcast({ type: 'log', entry });
  return entry;
}

function hudPluginUpdate(pluginId, status, message = '') {
  broadcast({
    type: 'plugin_update',
    pluginId,
    status,
    message,
    ts: Date.now(),
  });
}

function hudProviderUpdate(providerName, status, stats = {}) {
  broadcast({
    type: 'provider_update',
    providerName,
    status,
    stats,
    ts: Date.now(),
  });
}

module.exports = {
  initHudWS,
  hudLog,
  hudPluginUpdate,
  hudProviderUpdate,
};
