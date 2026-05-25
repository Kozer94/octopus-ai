export const EVENT_CATEGORY_COLORS = {
  ai: '#d2a8ff',
  event: '#8b949e',
  file: '#7ee787',
  git: '#f0883e',
  octopus: '#58a6ff',
  planner: '#a5d6ff',
  process: '#ffa657',
  session: '#79c0ff',
  system: '#8b949e',
  task: '#f778ba',
  terminal: '#56d4dd',
  validation: '#3fb950',
  workflow: '#f778ba',
};

export const EVENT_SEVERITY_COLORS = {
  critical: '#da3633',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
  debug: '#8b949e',
};

export function formatEventTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function getEventDurationMs(event, events) {
  if (!event?.type?.endsWith('.finished') && !event?.type?.endsWith('.exited')) return null;

  const prefix = event.type.replace(/\.(finished|exited)$/, '');
  const started = [...events]
    .reverse()
    .find(candidate => candidate.id < event.id && candidate.type === `${prefix}.started`);

  if (!started) return null;
  const startMs = new Date(started.timestamp).getTime();
  const endMs = new Date(event.timestamp).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getEventFilePath(event) {
  return event?.payload?.filePath || event?.payload?.newPath || event?.payload?.oldPath || '';
}
