const DEFAULT_BACKEND = 'http://localhost:3001';
const SESSION_STORAGE_KEY = 'octopus.sessionId';

export const BACKEND = (import.meta.env?.VITE_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, '');

export function createSessionId({ storage = globalThis.sessionStorage, now = Date.now } = {}) {
  const existing = storage?.getItem?.(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  const sessionId = `session_${now()}_${randomPart}`;
  storage?.setItem?.(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export const THEMES = {
  dark:      { name: 'Dark',      bg: '#0d1117', sidebar: '#161b22', border: '#30363d', text: '#e6edf3', textMuted: '#8b949e', accent: '#58a6ff', activityBar: '#161b22', statusBar: '#1f6feb', editorTheme: 'vs-dark' },
  dracula:   { name: 'Dracula',   bg: '#282a36', sidebar: '#21222c', border: '#44475a', text: '#f8f8f2', textMuted: '#6272a4', accent: '#bd93f9', activityBar: '#191a21', statusBar: '#6272a4', editorTheme: 'vs-dark' },
  monokai:   { name: 'Monokai',   bg: '#272822', sidebar: '#1e1f1c', border: '#3e3d32', text: '#f8f8f2', textMuted: '#75715e', accent: '#a6e22e', activityBar: '#1a1b18', statusBar: '#75715e', editorTheme: 'vs-dark' },
  nord:      { name: 'Nord',      bg: '#2e3440', sidebar: '#252931', border: '#3b4252', text: '#eceff4', textMuted: '#4c566a', accent: '#88c0d0', activityBar: '#21262d', statusBar: '#5e81ac', editorTheme: 'vs-dark' },
  solarized: { name: 'Solarized', bg: '#002b36', sidebar: '#073642', border: '#094857', text: '#839496', textMuted: '#7f9aa3', accent: '#2aa198', activityBar: '#01212b', statusBar: '#2aa198', editorTheme: 'vs-dark' },
  light:     { name: 'Light',     bg: '#ffffff', sidebar: '#f6f8fa', border: '#d0d7de', text: '#1f2328', textMuted: '#656d76', accent: '#0969da', activityBar: '#f0f0f0', statusBar: '#0969da', editorTheme: 'vs' },
};

export const INITIAL_LEGS = [
  { id: 1, name: "Writer Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 2, name: "Review Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 3, name: "Edit Leg",     status: "idle", task: "Waiting...", progress: 0 },
  { id: 4, name: "Test Leg",     status: "idle", task: "Waiting...", progress: 0 },
  { id: 5, name: "Manager Leg",  status: "idle", task: "Waiting...", progress: 0 },
  { id: 6, name: "Generate Leg", status: "idle", task: "Waiting...", progress: 0 },
  { id: 7, name: "Update Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 8, name: "Merge Leg",    status: "idle", task: "Waiting...", progress: 0 },
];

export const TYPING_SNIPPETS = [
  'function auth() {',
  '  const token = jwt.sign(',
  '  return response.json()',
  'class UserController {',
  '  public function login()',
  '  $user = User::find($id)',
  'const handleSubmit = () => {',
  '  await fetch("/api/login")',
];

export const ACTIVITY_ITEMS = [
  { id: 'explorer',   icon: 'codicon-files',          title: 'Explorer' },
  { id: 'search',     icon: 'codicon-search',          title: 'Search' },
  { id: 'git',        icon: 'codicon-source-control',  title: 'Git' },
  { id: 'extensions', icon: 'codicon-extensions',      title: 'Extensions' },
];
