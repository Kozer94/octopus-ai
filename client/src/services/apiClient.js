import { BACKEND } from '../config/uiConfig';

async function parseJsonResponse(response) {
  return response.json();
}

export async function postJson(path, body, options = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  return parseJsonResponse(response);
}

export async function getJson(path) {
  const response = await fetch(`${BACKEND}${path}`);
  return parseJsonResponse(response);
}

export async function postEventStream(path, body, { onMessage, signal } = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const data = await parseJsonResponse(response).catch(() => ({}));
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const line = event.split('\n').find(item => item.startsWith('data: '));
      if (!line) continue;
      onMessage?.(JSON.parse(line.slice(6)));
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    onMessage?.(JSON.parse(buffer.trim().slice(6)));
  }
}

export const filesApi = {
  list: dirPath => postJson('/api/files/list', { dirPath }),
  read: ({ filePath, projectDir }) => postJson('/api/files/read', { filePath, projectDir }),
  showInExplorer: filePath => postJson('/api/files/show-in-explorer', { filePath }),
  write: ({ filePath, content, projectDir }) => postJson('/api/files/write', { filePath, content, projectDir }),
};

export const gitApi = {
  status: cwd => postJson('/api/git/status', { cwd }),
  commit: ({ cwd, message }) => postJson('/api/git/commit', { cwd, message }),
};

export const workspaceApi = {
  search: ({ query, dirPath }) => postJson('/api/search', { query, dirPath }),
};

export const extensionsApi = {
  search: query => getJson(`/api/vsx-search?q=${encodeURIComponent(query)}&size=20`),
  install: extension => postJson('/api/extensions/install', { extension }),
  uninstall: extensionId => postJson('/api/extensions/uninstall', { extensionId }),
};

export const terminalApi = {
  command: ({ command, cwd, signal }) => postJson('/api/terminal', { command, cwd }, { signal }),
  interrupt: () => postJson('/api/terminal/interrupt', {}),
  run: ({ command, cwd }) => postJson('/api/run', { command, cwd }),
  stream: ({ command, cwd, onMessage, signal }) => postEventStream('/api/terminal/stream', { command, cwd }, { onMessage, signal }),
  stop: () => postJson('/api/stop', {}),
};

export const octopusApi = {
  send: payload => postJson('/api/octopus', payload),
  preview: ({ command, projectDir }) => postJson('/api/octopus/preview', { command, projectDir }),
  parallel: payload => postJson('/api/octopus/parallel', payload),
  reset: sessionId => postJson('/api/reset', { sessionId }),
};
