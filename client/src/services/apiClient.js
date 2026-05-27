import { BACKEND } from '../config/uiConfig.js';
import { getDynamicToken } from './securityBootstrap.js';

async function parseJsonResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

function getAuthHeaders() {
  // Read from localStorage directly every time (most reliable)
  const token = localStorage.getItem('octopusApiToken') || '';
  return token ? { 'X-Octopus-Token': token } : {};
}

function buildRateLimitError(response, data = {}) {
  const resetHeader = response.headers.get('RateLimit-Reset');
  const err = new Error(data.error || 'طلبات كثيرة جداً، الرجاء المحاولة لاحقاً');
  err.rateLimited = true;
  err.status = 429;
  if (resetHeader) err.resetAt = Number(resetHeader) * 1000;
  return err;
}

export async function postJson(path, body, options = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw buildRateLimitError(response, data);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server error ${response.status} — أعد تشغيل السيرفر`);
  }

  return parseJsonResponse(response);
}

export async function getJson(path) {
  const response = await fetch(`${BACKEND}${path}`, { headers: getAuthHeaders() });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw buildRateLimitError(response, data);
  }

  return parseJsonResponse(response);
}

export async function postEventStream(path, body, { onMessage, requireComplete = false, signal, inactivityTimeout = 120_000 } = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal,
  });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw buildRateLimitError(response, data);
  }

  if (!response.ok || !response.body) {
    const data = await parseJsonResponse(response).catch(() => ({}));
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  const INACTIVITY_TIMEOUT_MS = inactivityTimeout;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completeData = null;
  let streamError = null;

  function consumeEvent(rawEvent) {
    const lines = rawEvent.split('\n');
    const eventName = lines
      .find(item => item.startsWith('event: '))
      ?.slice(7)
      .trim() || 'message';
    const dataText = lines
      .filter(item => item.startsWith('data: '))
      .map(item => item.slice(6))
      .join('\n');

    if (!dataText) return;

    const data = JSON.parse(dataText);
    onMessage?.(data, eventName);

    if (eventName === 'complete') completeData = data;
    if (eventName === 'error') {
      streamError = new Error(data.error || data.message || 'Stream failed');
    }
  }

  while (true) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reader.cancel();
        reject(new Error(`Stream timed out: no event received for ${INACTIVITY_TIMEOUT_MS / 1000}s`));
      }, INACTIVITY_TIMEOUT_MS);
    });

    let chunk;
    try {
      chunk = await Promise.race([reader.read(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }

    const { done, value } = chunk;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      consumeEvent(event);
    }
  }

  if (buffer.trim()) consumeEvent(buffer.trim());
  if (streamError) throw streamError;
  if (requireComplete && !completeData) {
    throw new Error('Stream disconnected before completion');
  }
  return completeData;
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
  activate: extensionId => postJson('/api/extensions/activate', { extensionId }),
  deactivate: extensionId => postJson('/api/extensions/deactivate', { extensionId }),
  list: () => getJson('/api/extensions/list'),
  search: query => getJson(`/api/vsx-search?q=${encodeURIComponent(query)}&size=20`),
  install: extension => postJson('/api/extensions/install', { extension }),
  installLocalVsix: async file => {
    const response = await fetch(`${BACKEND}/api/extensions/install-local-vsix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-VSIX-Filename': encodeURIComponent(file.name || 'extension.vsix'),
        ...getAuthHeaders(),
      },
      body: await file.arrayBuffer(),
    });
    return parseJsonResponse(response);
  },
  status: extensionId => getJson(`/api/extensions/status/${encodeURIComponent(extensionId)}`),
  uninstall: extensionId => postJson('/api/extensions/uninstall', { extensionId }),
};

export const shimApi = {
  repair: ({ extensionId, errorSignal }) => postJson('/api/shim/repair', { extensionId, errorSignal }),
};

export const terminalApi = {
  command: ({ command, cwd, signal }) => postJson('/api/terminal', { command, cwd }, { signal }),
  interrupt: () => postJson('/api/terminal/interrupt', {}),
  run: ({ command, cwd }) => postJson('/api/run', { command, cwd }),
  stream: ({ command, cwd, onMessage, signal }) => postEventStream('/api/terminal/stream', { command, cwd }, { onMessage, signal, inactivityTimeout: 600_000 }),
  stop: () => postJson('/api/stop', {}),
};

function timedAbortSignal(ms) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  ac.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
  return ac.signal;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForOctopusJob(jobId, { intervalMs = 1000, timeoutMs = 310_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await getJson(`/api/octopus/jobs/${encodeURIComponent(jobId)}`);
    const job = data.job;
    if (job?.status === 'completed') return job.result;
    if (job?.status === 'failed') throw new Error(job.error || 'Job failed');
    if (job?.status === 'cancelled') throw new Error(job.error || 'Job cancelled');
    await delay(intervalMs);
  }
  throw new Error('Job polling timed out');
}

async function resolveQueuedOctopusResponse(response, options = {}) {
  if (!response?.queued || !response.jobId) return response;
  return waitForOctopusJob(response.jobId, options);
}

export const octopusApi = {
  send: payload => postJson('/api/octopus', payload, { signal: timedAbortSignal(30_000) })
    .then(data => resolveQueuedOctopusResponse(data, { timeoutMs: 120_000 })),
  preview: ({ command, projectDir }) => postJson('/api/octopus/preview', { command, projectDir }, { signal: timedAbortSignal(30_000) })
    .then(data => resolveQueuedOctopusResponse(data, { timeoutMs: 95_000 })),
  parallel: payload => postJson('/api/octopus/parallel', payload, { signal: timedAbortSignal(30_000) })
    .then(data => resolveQueuedOctopusResponse(data, { timeoutMs: 310_000 })),
  job: jobId => getJson(`/api/octopus/jobs/${encodeURIComponent(jobId)}`),
  jobs: () => getJson('/api/octopus/jobs'),
  parallelStream: (payload, handlers = {}) => postEventStream('/api/octopus/parallel/stream', payload, { ...handlers, requireComplete: true, signal: timedAbortSignal(310_000) }),
  reset: sessionId => postJson('/api/reset', { sessionId }),
};

export const scanApi = {
  scan: (projectDir) => postJson('/api/scan', { projectDir }),
};

export const eventsApi = {
  recent: ({ category = '', sessionId = '', severity = '', sinceId = '', taskId = '', traceId = '', type = '', limit = 100 } = {}) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (sessionId) params.set('sessionId', sessionId);
    if (severity) params.set('severity', severity);
    if (type) params.set('type', type);
    if (sinceId) params.set('sinceId', sinceId);
    if (taskId) params.set('taskId', taskId);
    if (traceId) params.set('traceId', traceId);
    params.set('limit', String(limit));
    return getJson(`/api/events?${params.toString()}`);
  },
  publish: ({ type, payload = {}, metadata = {} }) => postJson('/api/events/publish', { type, payload, metadata }),
  streamUrl: ({ category = '', sessionId = '', severity = '', sinceId = '', taskId = '', traceId = '', type = '', replay = true } = {}) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (sessionId) params.set('sessionId', sessionId);
    if (severity) params.set('severity', severity);
    if (sinceId) params.set('sinceId', sinceId);
    if (taskId) params.set('taskId', taskId);
    if (traceId) params.set('traceId', traceId);
    if (type) params.set('type', type);
    params.set('replay', replay ? '1' : '0');
    return `${BACKEND}/api/events/stream?${params.toString()}`;
  },
};

export const runtimeApi = {
  tasks: ({ workflowId = '', status = '', type = '' } = {}) => {
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    return getJson(`/api/runtime/tasks?${params.toString()}`);
  },
  schedule: task => postJson('/api/runtime/tasks', task),
  run: taskId => postJson(`/api/runtime/tasks/${encodeURIComponent(taskId)}/run`, {}),
  cancel: (taskId, reason = '') => postJson(`/api/runtime/tasks/${encodeURIComponent(taskId)}/cancel`, { reason }),
  retry: taskId => postJson(`/api/runtime/tasks/${encodeURIComponent(taskId)}/retry`, {}),
  graph: workflowId => getJson(`/api/runtime/graph/${encodeURIComponent(workflowId)}`),
  tree: workflowId => getJson(`/api/runtime/tree/${encodeURIComponent(workflowId)}`),
  trace: traceId => getJson(`/api/runtime/traces/${encodeURIComponent(traceId)}`),
  replay: traceId => getJson(`/api/runtime/replay/${encodeURIComponent(traceId)}`),
  replayV2: traceId => getJson(`/api/runtime/replay-v2/${encodeURIComponent(traceId)}`),
  controlPlane: () => getJson('/api/runtime/control-plane'),
  workers: () => getJson('/api/runtime/workers'),
  metrics: () => getJson('/api/runtime/metrics'),
};
