import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import '@vscode/codicons/dist/codicon.css';

const BACKEND = "http://localhost:3001";
const SESSION_ID = "session_" + Date.now();

const THEMES = {
  dark:      { name: 'Dark',      bg: '#0d1117', sidebar: '#161b22', border: '#30363d', text: '#e6edf3', textMuted: '#8b949e', accent: '#58a6ff', activityBar: '#161b22', statusBar: '#1f6feb', editorTheme: 'vs-dark' },
  dracula:   { name: 'Dracula',   bg: '#282a36', sidebar: '#21222c', border: '#44475a', text: '#f8f8f2', textMuted: '#6272a4', accent: '#bd93f9', activityBar: '#191a21', statusBar: '#6272a4', editorTheme: 'vs-dark' },
  monokai:   { name: 'Monokai',   bg: '#272822', sidebar: '#1e1f1c', border: '#3e3d32', text: '#f8f8f2', textMuted: '#75715e', accent: '#a6e22e', activityBar: '#1a1b18', statusBar: '#75715e', editorTheme: 'vs-dark' },
  nord:      { name: 'Nord',      bg: '#2e3440', sidebar: '#252931', border: '#3b4252', text: '#eceff4', textMuted: '#4c566a', accent: '#88c0d0', activityBar: '#21262d', statusBar: '#5e81ac', editorTheme: 'vs-dark' },
  solarized: { name: 'Solarized', bg: '#002b36', sidebar: '#073642', border: '#094857', text: '#839496', textMuted: '#586e75', accent: '#2aa198', activityBar: '#01212b', statusBar: '#2aa198', editorTheme: 'vs-dark' },
  light:     { name: 'Light',     bg: '#ffffff', sidebar: '#f6f8fa', border: '#d0d7de', text: '#1f2328', textMuted: '#656d76', accent: '#0969da', activityBar: '#f0f0f0', statusBar: '#0969da', editorTheme: 'vs' },
};

const INITIAL_LEGS = [
  { id: 1, name: "Writer Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 2, name: "Review Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 3, name: "Edit Leg",     status: "idle", task: "Waiting...", progress: 0 },
  { id: 4, name: "Test Leg",     status: "idle", task: "Waiting...", progress: 0 },
  { id: 5, name: "Manager Leg",  status: "idle", task: "Waiting...", progress: 0 },
  { id: 6, name: "Generate Leg", status: "idle", task: "Waiting...", progress: 0 },
  { id: 7, name: "Update Leg",   status: "idle", task: "Waiting...", progress: 0 },
  { id: 8, name: "Merge Leg",    status: "idle", task: "Waiting...", progress: 0 },
];

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const lowerName = name.toLowerCase();
  const specialFiles = {
    'artisan': { icon: 'codicon-tools', color: '#ff6b6b' },
    '.htaccess': { icon: 'codicon-shield', color: '#c9d1d9' },
    '.gitignore': { icon: 'codicon-source-control', color: '#f05032' },
    '.gitattributes': { icon: 'codicon-source-control', color: '#f05032' },
    '.npmrc': { icon: 'codicon-package', color: '#cb3837' },
    '.editorconfig': { icon: 'codicon-settings-gear', color: '#ffa657' },
    'dockerfile': { icon: 'codicon-server', color: '#0db7ed' },
    'makefile': { icon: 'codicon-tools', color: '#6e7681' },
    'procfile': { icon: 'codicon-play', color: '#7ee787' },
  };
  const iconMap = {
    js: { icon: 'codicon-symbol-method', color: '#f7df1e' },
    jsx: { icon: 'codicon-symbol-method', color: '#61dafb' },
    ts: { icon: 'codicon-symbol-method', color: '#3178c6' },
    tsx: { icon: 'codicon-symbol-method', color: '#61dafb' },
    php: { icon: 'codicon-symbol-class', color: '#8892be' },
    css: { icon: 'codicon-symbol-color', color: '#42a5f5' },
    html: { icon: 'codicon-code', color: '#e44d26' },
    json: { icon: 'codicon-json', color: '#ffa657' },
    md: { icon: 'codicon-markdown', color: '#7ee787' },
    py: { icon: 'codicon-symbol-class', color: '#3572a5' },
    sh: { icon: 'codicon-terminal', color: '#4caf50' },
    sql: { icon: 'codicon-database', color: '#e38d44' },
    svg: { icon: 'codicon-file-media', color: '#ff9800' },
    lock: { icon: 'codicon-lock', color: '#6e7681' },
    yaml: { icon: 'codicon-settings', color: '#cb171e' },
    yml: { icon: 'codicon-settings', color: '#cb171e' },
    txt: { icon: 'codicon-file-text', color: '#c9d1d9' },
    env: { icon: 'codicon-settings-gear', color: '#ecd53f' },
    xml: { icon: 'codicon-code', color: '#f48fb1' },
    toml: { icon: 'codicon-settings', color: '#ffa657' },
    ini: { icon: 'codicon-settings', color: '#ffa657' },
    cache: { icon: 'codicon-database', color: '#6e7681' },
    log: { icon: 'codicon-output', color: '#6e7681' },
  };
  if (specialFiles[lowerName]) return specialFiles[lowerName];
  if (lowerName.startsWith('.env')) return { icon: 'codicon-settings-gear', color: '#ecd53f' };
  if (iconMap[ext]) return iconMap[ext];
  return { icon: 'codicon-file', color: '#8b949e' };
}

function FileTreeNode({ item, level, activeFile, onFileClick, t }) {
  const [open, setOpen] = useState(false);
  const folderColors = {
    app: '#58a6ff', src: '#58a6ff', components: '#79c0ff', config: '#ffa657',
    database: '#ff7b72', routes: '#7ee787', public: '#d2a8ff', resources: '#56d364',
    storage: '#ffa657', tests: '#f778ba', bootstrap: '#ff7b72', lang: '#39d353',
    models: '#79c0ff', controllers: '#58a6ff', views: '#56d364', middleware: '#ffa726',
    providers: '#d2a8ff', mail: '#58a6ff', pages: '#79c0ff', hooks: '#d2a8ff',
    utils: '#ffa657', assets: '#56d364', styles: '#42a5f5', lib: '#ffa657',
  };
  const folderColor = folderColors[item.name.toLowerCase()] || '#e2a14a';

  if (item.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen(p => !p)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: `3px 8px 3px ${8 + level * 12}px`, cursor: "pointer", userSelect: "none", borderRadius: 4, margin: "1px 4px" }}
          onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ color: t.textMuted, fontSize: 9, width: 10 }}>{open ? '▾' : '▸'}</span>
          <i className={`codicon ${open ? 'codicon-folder-opened' : 'codicon-folder'}`} style={{ color: folderColor, fontSize: 14, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: open ? t.text : t.textMuted }}>{item.name}</span>
        </div>
        {open && item.children && (
          <div style={{ borderRight: `1px solid ${folderColor}22`, marginRight: 4 }}>
            {item.children.map(child => <FileTreeNode key={child.path} item={child} level={level + 1} activeFile={activeFile} onFileClick={onFileClick} t={t} />)}
          </div>
        )}
      </div>
    );
  }

  const { icon, color } = getFileIcon(item.name);
  const isActive = item.name === activeFile;
  return (
    <div
      onClick={() => onFileClick(item)}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: `3px 8px 3px ${8 + level * 12}px`, cursor: "pointer", borderRadius: 4, margin: "1px 4px", background: isActive ? t.accent + '22' : 'transparent', borderRight: isActive ? `2px solid ${t.accent}` : '2px solid transparent' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.border + '66' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <i className={`codicon ${icon}`} style={{ color, fontSize: 14, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: isActive ? t.text : t.textMuted }}>{item.name}</span>
    </div>
  );
}

function OctopusWorking({ active, legs }) {
  const workingLegs = legs.filter(l => l.status === 'working');
  if (!active || workingLegs.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <style>{`
          @keyframes octopusBob {
            0%, 100% { transform: translateY(0px) rotate(-3deg); }
            50% { transform: translateY(-8px) rotate(3deg); }
          }
          @keyframes tentacle1 {
            0%, 100% { transform: rotate(-20deg); }
            50% { transform: rotate(20deg); }
          }
          @keyframes tentacle2 {
            0%, 100% { transform: rotate(20deg); }
            50% { transform: rotate(-20deg); }
          }
          @keyframes octopusBlink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
          @keyframes octopusTyping {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>

        <svg width="120" height="120" viewBox="0 0 120 120" style={{ animation: 'octopusBob 1.2s ease-in-out infinite' }}>
          <ellipse cx="60" cy="45" rx="32" ry="28" fill="#ff6b2b" />
          <ellipse cx="60" cy="34" rx="28" ry="24" fill="#ff8c42" />
          <ellipse cx="60" cy="42" rx="20" ry="14" fill="#e85520" opacity="0.4" />
          <g style={{ animation: 'octopusBlink 3s infinite', transformOrigin: '60px 30px' }}>
            <circle cx="49" cy="30" r="7" fill="white" />
            <circle cx="71" cy="30" r="7" fill="white" />
            <circle cx="50.5" cy="31.5" r="4.5" fill="#1a0a00" />
            <circle cx="72.5" cy="31.5" r="4.5" fill="#1a0a00" />
            <circle cx="51.5" cy="30" r="1.5" fill="white" />
            <circle cx="73.5" cy="30" r="1.5" fill="white" />
          </g>
          <path d="M50 42 Q60 49 70 42" stroke="#c23d0a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="45" cy="50" r="3" fill="#ff4500" opacity="0.6" />
          <circle cx="60" cy="55" r="3" fill="#ff4500" opacity="0.6" />
          <circle cx="75" cy="50" r="3" fill="#ff4500" opacity="0.6" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const x = 24 + i * 10.5;
            const delay = i * 0.15;
            const curve = i % 2 === 0 ? -6 : 6;
            return (
              <g key={i} style={{ transformOrigin: `${x}px 65px`, animation: `${i % 2 === 0 ? 'tentacle1' : 'tentacle2'} ${0.7 + i * 0.08}s ease-in-out infinite`, animationDelay: `${delay}s` }}>
                <path d={`M${x} 65 Q${x + curve} 82 ${x + curve * 0.5} 100`} stroke="#ff6b2b" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
                <path d={`M${x} 65 Q${x + curve} 82 ${x + curve * 0.5} 100`} stroke="#ff8c42" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{
        background: '#0d1117', border: '0.5px solid #30363d',
        borderRadius: 10, padding: '10px 16px', maxWidth: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f0883e', animation: 'octopusTyping 0.8s infinite' }} />
          <span style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 500 }}>Octopus working...</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {workingLegs.map((leg, i) => (
            <div key={leg.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f0883e', animation: `octopusTyping ${0.6 + i * 0.2}s infinite`, animationDelay: `${i * 0.1}s`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#8b949e' }}>{leg.name}:</span>
              <span style={{ fontSize: 11, color: '#c9d1d9', fontFamily: 'monospace' }}>{leg.task}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, padding: '6px 8px', background: '#161b22', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: '#7ee787' }}>
          <TypingCode />
        </div>
      </div>
    </div>
  );
}

function TypingCode() {
  const [text, setText] = useState('');
  const [idx, setIdx] = useState(0);
  const [snippetIdx, setSnippetIdx] = useState(0);
  const snippets = [
    'function auth() {',
    '  const token = jwt.sign(',
    '  return response.json()',
    'class UserController {',
    '  public function login()',
    '  $user = User::find($id)',
    'const handleSubmit = () => {',
    '  await fetch("/api/login")',
  ];

  useEffect(() => {
    const current = snippets[snippetIdx % snippets.length];
    if (idx < current.length) {
      const timer = setTimeout(() => {
        setText(current.slice(0, idx + 1));
        setIdx(idx + 1);
      }, 50);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setText('');
      setIdx(0);
      setSnippetIdx(s => s + 1);
    }, 800);
    return () => clearTimeout(timer);
  }, [idx, snippetIdx, snippets]);

  return <span>{text}<span style={{ animation: 'octopusTyping 0.5s infinite', opacity: 0.8 }}>|</span></span>;
}

export default function App() {
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState("");
  const [legs, setLegs] = useState(INITIAL_LEGS);
  const [messages, setMessages] = useState([{ role: "octopus", text: "Hello 🐙 I'm ready. Tell me what you want to build." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [themeOpen, setThemeOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState([{ type: 'system', text: '🐙 Terminal ready' }]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalTab, setTerminalTab] = useState('terminal');
  const [currentDir, setCurrentDir] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [terminalHeight, setTerminalHeight] = useState(180);
  const [activeActivity, setActiveActivity] = useState('explorer');
  const [projectName, setProjectName] = useState('Octopus');
  const [isRunning, setIsRunning] = useState(false);
  const [runProcess, setRunProcess] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [gitFiles, setGitFiles] = useState([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [gitLoading, setGitLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // 'file' | 'edit' | 'view' | 'run' | 'help' | null
  const [extSearchQuery, setExtSearchQuery] = useState('');
  const [extSearchResults, setExtSearchResults] = useState([]);
  const [extSearching, setExtSearching] = useState(false);
  const [installedExtensions, setInstalledExtensions] = useState([]);
  const [selectedExtension, setSelectedExtension] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState('chat');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);
  const terminalBottomRef = useRef(null);
  const searchInputRef = useRef(null);
  const t = THEMES[theme];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [terminalHistory]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(p => !p);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setTerminalOpen(p => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function startSidebarResize(e) {
    e.preventDefault();
    const startX = e.clientX, startW = sidebarWidth;
    const onMove = e => setSidebarWidth(Math.max(150, Math.min(350, startW + e.clientX - startX)));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startTerminalResize(e) {
    e.preventDefault();
    const startY = e.clientY, startH = terminalHeight;
    const onMove = e => setTerminalHeight(Math.max(80, Math.min(400, startH - (e.clientY - startY))));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function onFileClick(item) {
    setActiveFile(item.name);
    const already = files.find(f => f.path === item.path);
    if (already?.content) return;
    try {
      const res = await fetch(`${BACKEND}/api/files/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath: item.path }) });
      const data = await res.json();
      if (data.success) setFiles(prev => { const exists = prev.find(f => f.path === item.path); if (exists) return prev.map(f => f.path === item.path ? { ...f, content: data.content } : f); return [...prev, { ...item, content: data.content }]; });
    } catch { }
  }

  async function openFolder() {
    if (!window.octopus) return;
    const folderPath = await window.octopus.openFolder();
    if (!folderPath) return;
    const name = folderPath.split('\\').pop() || folderPath.split('/').pop();

    // أضف للمشاريع المحفوظة
    setProjects(prev => {
      const exists = prev.find(p => p.path === folderPath);
      if (exists) return prev;
      return [...prev, { name, path: folderPath }];
    });

    setProjectName(name);
    setCurrentDir(folderPath);
    const res = await fetch(`${BACKEND}/api/files/list`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dirPath: folderPath }) });
    const data = await res.json();
    if (data.success) { setFileTree(data.items); setFiles([]); setActiveFile(''); setGitFiles([]); }
  }

  async function switchProject(project) {
    setProjectName(project.name);
    setCurrentDir(project.path);
    setFiles([]);
    setActiveFile('');
    setGitFiles([]);
    setProjectsOpen(false);
    const res = await fetch(`${BACKEND}/api/files/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath: project.path }),
    });
    const data = await res.json();
    if (data.success) setFileTree(data.items);
  }

  async function runCommand(cmd) {
    if (!cmd.trim()) return;
    setTerminalHistory(prev => [...prev, { type: 'input', text: `$ ${cmd}` }]);
    setTerminalInput('');
    setTerminalOpen(true);
    setTerminalTab('terminal');

    try {
      const controller = new AbortController();
      const res = await fetch(`${BACKEND}/api/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, cwd: currentDir }),
        signal: controller.signal,
      });
      const data = await res.json();
      setTerminalHistory(prev => [...prev, {
        type: data.success ? 'output' : 'error',
        text: data.output || data.error || ''
      }]);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setTerminalHistory(prev => [...prev, { type: 'error', text: '⚠️ ' + e.message }]);
      }
    }
  }

  async function toggleRun() {
    if (isRunning) {
      const res = await fetch(`${BACKEND}/api/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setIsRunning(false);
      setRunProcess(null);
      setTerminalHistory(prev => [...prev, { type: 'system', text: data.output }]);
      return;
    }

    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalTab('terminal');

    // اكتشاف نوع المشروع تلقائياً
    let command = 'npm run dev';
    const fileNames = fileTree.map(f => f.name);
    if (fileNames.includes('artisan')) command = 'php artisan serve';
    else if (fileNames.includes('manage.py')) command = 'python manage.py runserver';

    setRunProcess(command);
    setTerminalHistory(prev => [...prev, { type: 'system', text: `🚀 Running: ${command}` }]);

    try {
      const res = await fetch(`${BACKEND}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: currentDir }),
      });
      const data = await res.json();
      setTerminalHistory(prev => [...prev, { type: 'output', text: data.output }]);
    } catch {
      setTerminalHistory(prev => [...prev, { type: 'error', text: '⚠️ Run error' }]);
      setIsRunning(false);
      setRunProcess(null);
    }
  }

  async function doSearch(q) {
    if (!q.trim() || !currentDir) return;
    setSearching(true);
    try {
      const res = await fetch(`${BACKEND}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, dirPath: currentDir }),
      });
      const data = await res.json();
      if (data.success) setSearchResults(data.results);
    } catch { }
    setSearching(false);
  }

  async function loadGitStatus() {
    if (!currentDir) return;
    setGitLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/git/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: currentDir }),
      });
      const data = await res.json();
      if (data.success) setGitFiles(data.files);
    } catch { }
    setGitLoading(false);
  }

  async function doCommit() {
    if (!commitMsg.trim()) return;
    const res = await fetch(`${BACKEND}/api/git/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: currentDir, message: commitMsg }),
    });
    const data = await res.json();
    setTerminalHistory(prev => [...prev, { type: data.success ? 'output' : 'error', text: data.output }]);
    setTerminalOpen(true);
    setCommitMsg('');
    loadGitStatus();
  }

  function activateLeg(id, task) {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, status: "working", task, progress: 0 } : l));
    const interval = setInterval(() => {
      setLegs(prev => { const leg = prev.find(l => l.id === id); if (!leg || leg.progress >= 100) { clearInterval(interval); return prev; } return prev.map(l => l.id === id ? { ...l, progress: l.progress + 15 } : l); });
    }, 200);
  }

  function completeLeg(id) { setLegs(prev => prev.map(l => l.id === id ? { ...l, status: "done", progress: 100 } : l)); }
  function resetLegs() { setLegs(INITIAL_LEGS); }
  function extractCode(text) { const m = text.match(/```(?:\w+)?\n([\s\S]*?)```/); return m ? m[1] : null; }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (awaitingConfirm) {
      setMessages(prev => [...prev, { role: "octopus", text: "⏳ Please confirm or cancel the current plan first." }]);
      return;
    }
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);
    resetLegs();

    const openFilesContext = files
      .filter(f => f.content)
      .slice(0, 5)
      .map(f => `### ${f.name}:\n\`\`\`\n${f.content?.slice(0, 500)}\n\`\`\``)
      .join('\n\n');

    const isReportRequest = /فحص|تقرير|تقريري|حلل|تحليل|وثق|توثيق|ملخص|ملخّص|report|analyze|analysis|documentation|markdown|\bmd\b/i.test(text);
    const isComplexTask = text.length > 20 || isReportRequest;

    if (!isComplexTask) {
      activateLeg(1, "Analyzing request...");
      const currentFile = files.find(f => f.name === activeFile);
      try {
        const res = await fetch(`${BACKEND}/api/octopus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: text, sessionId: SESSION_ID, activeFile, activeFileContent: currentFile?.content || "", projectContext: openFilesContext, projectDir: currentDir }) });
        const data = await res.json();
        if (data.terminalCommand) { setTerminalOpen(true); await runCommand(data.terminalCommand); }
        if (data.success) {
          const terminalMatch = data.result.match(/<terminal>(.*?)<\/terminal>/s);
          if (terminalMatch) await runCommand(terminalMatch[1].trim());
          const code = extractCode(data.result);
          if (code) setFiles(prev => { const exists = prev.find(f => f.name === activeFile); if (exists) return prev.map(f => f.name === activeFile ? { ...f, content: code } : f); return [...prev, { name: activeFile, content: code }]; });
          completeLeg(1);
          setMessages(prev => [...prev, { role: "octopus", text: data.result }]);
        } else { setMessages(prev => [...prev, { role: "octopus", text: `Error: ${data.error}` }]); resetLegs(); }
      } catch { setMessages(prev => [...prev, { role: "octopus", text: "⚠️ Could not connect to server." }]); resetLegs(); }
      setLoading(false);
      return;
    }

    // Complex tasks: preview first before execution
    activateLeg(1, "Scanning project...");
    activateLeg(2, "Planning tasks...");
    setMessages(prev => [...prev, { role: "octopus", text: "🔍 Octopus is scanning the project and building an execution plan..." }]);

    try {
      const res = await fetch(`${BACKEND}/api/octopus/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text, projectDir: currentDir }),
      });
      const data = await res.json();
      completeLeg(1); completeLeg(2);
      if (data.success) {
        setMessages(prev => [...prev, { role: "octopus", text: data.preview }]);
        setPendingPlan({ plan: data.plan, command: text, openFilesContext });
        setAwaitingConfirm(true);
      } else {
        setMessages(prev => [...prev, { role: "octopus", text: `Scan error: ${data.error}` }]);
        resetLegs();
      }
    } catch { setMessages(prev => [...prev, { role: "octopus", text: "⚠️ Could not connect to server." }]); resetLegs(); }
    setLoading(false);
  }

  async function executeApprovedPlan() {
    if (!pendingPlan) return;
    const { command, plan, openFilesContext } = pendingPlan;
    setAwaitingConfirm(false);
    setPendingPlan(null);
    setLoading(true);
    resetLegs();
    const currentFile = files.find(f => f.name === activeFile);

    if (plan && plan.tasks) {
      plan.tasks.forEach(task => activateLeg(task.leg, task.task));
    } else {
      activateLeg(1, "Writing code..."); activateLeg(2, "Reviewing...");
    }

    try {
      const res = await fetch(`${BACKEND}/api/octopus/parallel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, sessionId: SESSION_ID, activeFile, activeFileContent: currentFile?.content || "", projectContext: openFilesContext, projectDir: currentDir, confirmed: true, plan }),
      });
      const data = await res.json();

      if (data.terminalCommand) { setTerminalOpen(true); await runCommand(data.terminalCommand); }

      if (data.savedFiles && data.savedFiles.length > 0) {
        let lastOpenedFile = null;
        for (const file of data.savedFiles) {
          // استخدام relativePath للقراءة مع projectDir
          const readPath = file.relativePath || file.path;
          const res2 = await fetch(`${BACKEND}/api/files/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: readPath, projectDir: currentDir }),
          });
          const fileData = await res2.json();
          if (fileData.success) {
            const fileName = file.name || readPath.split('/').pop().split('\\').pop();
            setFiles(prev => {
              const exists = prev.find(f => f.path === file.path || f.name === fileName);
              if (exists) return prev.map(f => (f.path === file.path || f.name === fileName) ? { ...f, name: fileName, path: file.path, content: fileData.content } : f);
              return [...prev, { name: fileName, path: file.path, content: fileData.content }];
            });
            lastOpenedFile = fileName;
          }
        }
        // فتح آخر ملف كتبه AI في المحرر تلقائياً
        if (lastOpenedFile) setActiveFile(lastOpenedFile);
        if (currentDir) {
          fetch(`${BACKEND}/api/files/list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dirPath: currentDir }) })
            .then(r => r.json()).then(d => { if (d.success) setFileTree(d.items); });
        }
      }

      if (data.success) {
        const terminalMatch = data.result.match(/<terminal>(.*?)<\/terminal>/s);
        if (terminalMatch) await runCommand(terminalMatch[1].trim());
        setTimeout(async () => {
          const code = extractCode(data.result);
          if (code) {
            setFiles(prev => { const exists = prev.find(f => f.name === activeFile); if (exists) return prev.map(f => f.name === activeFile ? { ...f, content: code } : f); return [...prev, { name: activeFile, content: code }]; });
            if (currentFile?.path) await fetch(`${BACKEND}/api/files/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath: currentFile.path, content: code }) });
          }
          legs.forEach(l => completeLeg(l.id));
          setMessages(prev => [...prev, { role: "octopus", text: data.result }]);
        }, 800);
      } else { setMessages(prev => [...prev, { role: "octopus", text: `Error: ${data.error}` }]); resetLegs(); }
    } catch { setMessages(prev => [...prev, { role: "octopus", text: "⚠️ Could not connect to server." }]); resetLegs(); }
    setLoading(false);
  }

  function cancelPlan() {
    setMessages(prev => [...prev, { role: "octopus", text: "Cancelled 🐙" }]);
    setPendingPlan(null);
    setAwaitingConfirm(false);
    resetLegs();
  }

  async function reset() {
    await fetch(`${BACKEND}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SESSION_ID }) });
    setMessages([{ role: "octopus", text: "Conversation cleared 🐙" }]);
  }

  function onKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  const currentFile = files.find(f => f.name === activeFile);
  const legColor = (s) => s === "done" ? "#3fb950" : s === "working" ? "#f0883e" : t.textMuted;

  async function searchExtensions(query) {
    if (!query.trim()) {
      setExtSearchResults([]);
      return;
    }
    setExtSearching(true);
    try {
      const res = await fetch(`${BACKEND}/api/vsx-search?q=${encodeURIComponent(query)}&size=20`);
      const data = await res.json();
      setExtSearchResults(data.extensions || []);
    } catch (error) {
      console.error('Failed to search extensions:', error);
      setExtSearchResults([]);
    }
    setExtSearching(false);
  }

  async function installExtension(extension) {
    try {
      const res = await fetch(`${BACKEND}/api/extensions/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension }),
      });
      const data = await res.json();
      if (data.success) {
        setInstalledExtensions(prev => [...prev, extension]);
      }
    } catch (error) {
      console.error('Failed to install extension:', error);
    }
  }

  async function uninstallExtension(extensionId) {
    try {
      const res = await fetch(`${BACKEND}/api/extensions/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionId }),
      });
      const data = await res.json();
      if (data.success) {
        setInstalledExtensions(prev => prev.filter(ext => ext.id !== extensionId));
      }
    } catch (error) {
      console.error('Failed to uninstall extension:', error);
    }
  }

  function isExtensionInstalled(extensionId) {
    return installedExtensions.some(ext => ext.id === extensionId);
  }

  const activityItems = [
    { id: 'explorer',   icon: 'codicon-files',          title: 'Explorer' },
    { id: 'search',     icon: 'codicon-search',          title: 'Search' },
    { id: 'git',        icon: 'codicon-source-control',  title: 'Git' },
    { id: 'extensions', icon: 'codicon-extensions',      title: 'Extensions' },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: t.bg, color: t.text, fontFamily: "'Inter', 'Segoe UI', sans-serif" }} onClick={() => menuOpen && setMenuOpen(null)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
      `}</style>

      {/* Title + Menu Bar (merged) */}
      <div
        style={{ display: "flex", alignItems: "center", height: 36, background: t.activityBar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, padding: "0 10px", gap: 0, position: 'relative', zIndex: 200 }}
        onClick={() => { if (menuOpen) setMenuOpen(null); }}
      >
        {/* Logo */}
        <span style={{ fontSize: 17, marginRight: 6, lineHeight: 1 }}>🐙</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.accent, marginRight: 12, whiteSpace: 'nowrap' }}>Octopus AI</span>

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: t.border, marginRight: 8, flexShrink: 0 }} />

        {/* Menu Items */}
        {[
          {
            id: 'file', label: 'File',
            items: [
              { label: 'Open Folder...', icon: 'codicon-folder-opened', action: () => openFolder(), shortcut: 'Ctrl+O' },
              { label: 'New File', icon: 'codicon-new-file', action: () => { const name = prompt("File name:"); if (name) setFiles(prev => [...prev, { name, content: "" }]); setActiveFile(name || ''); }, shortcut: 'Ctrl+N' },
              { separator: true },
              { label: 'Save', icon: 'codicon-save', action: async () => { const cf = files.find(f => f.name === activeFile); if (cf?.path && cf.content !== undefined) { await fetch(`${BACKEND}/api/files/write`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: cf.path, content: cf.content }) }); } }, shortcut: 'Ctrl+S' },
              { separator: true },
              { label: 'Reset Conversation', icon: 'codicon-refresh', action: () => reset() },
            ]
          },
          {
            id: 'edit', label: 'Edit',
            items: [
              { label: 'Search in Files', icon: 'codicon-search', action: () => { setActiveActivity('search'); setSidebarOpen(true); }, shortcut: 'Ctrl+Shift+F' },
              { label: 'File Explorer', icon: 'codicon-files', action: () => { setActiveActivity('explorer'); setSidebarOpen(true); }, shortcut: 'Ctrl+Shift+E' },
              { separator: true },
              { label: 'Git', icon: 'codicon-source-control', action: () => { setActiveActivity('git'); setSidebarOpen(true); }, shortcut: 'Ctrl+Shift+G' },
            ]
          },
          {
            id: 'view', label: 'View',
            items: [
              { label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', icon: 'codicon-layout-sidebar-left', action: () => setSidebarOpen(p => !p), shortcut: 'Ctrl+B' },
              { label: terminalOpen ? 'Hide Terminal' : 'Show Terminal', icon: 'codicon-terminal', action: () => setTerminalOpen(p => !p), shortcut: 'Ctrl+`' },
              { label: rightPanelOpen ? 'Hide Chat Panel' : 'Show Chat Panel', icon: 'codicon-comment-discussion', action: () => setRightPanelOpen(p => !p) },
              { separator: true },
              ...Object.entries(THEMES).map(([key, th]) => ({
                label: th.name,
                icon: theme === key ? 'codicon-check' : 'codicon-circle-large-outline',
                action: () => setTheme(key),
              })),
            ]
          },
          {
            id: 'run', label: 'Run',
            items: [
              { label: isRunning ? 'Stop Project' : 'Run Project', icon: isRunning ? 'codicon-debug-stop' : 'codicon-play', action: () => { toggleRun(); }, shortcut: 'F5' },
              { separator: true },
              { label: 'Open Terminal', icon: 'codicon-terminal', action: () => { setTerminalOpen(true); setTerminalTab('terminal'); } },
            ]
          },
          {
            id: 'help', label: 'Help',
            items: [
              { label: 'About Octopus', icon: 'codicon-info', action: () => setMessages(prev => [...prev, { role: 'octopus', text: '🐙 **Octopus AI** — AI assistant for building web applications\n\nRuns with 8 parallel legs to complete tasks fast!' }]) },
              { label: 'Extensions', icon: 'codicon-extensions', action: () => { setActiveActivity('extensions'); setSidebarOpen(true); } },
            ]
          },
        ].map(menu => (
          <div key={menu.id} style={{ position: 'relative' }}>
            <button
              style={{ background: menuOpen === menu.id ? t.border : 'transparent', border: 'none', color: menuOpen === menu.id ? t.text : t.textMuted, padding: '3px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4, height: 24 }}
              onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === menu.id ? null : menu.id); }}
              onMouseEnter={e => { if (menuOpen && menuOpen !== menu.id) { setMenuOpen(menu.id); } e.currentTarget.style.color = t.text; }}
              onMouseLeave={e => { if (menuOpen !== menu.id) e.currentTarget.style.color = t.textMuted; }}
            >
              {menu.label}
            </button>
            {menuOpen === menu.id && (
              <div
                style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '4px 0', zIndex: 999, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                onClick={e => e.stopPropagation()}
              >
                {menu.items.map((item, i) =>
                  item.separator
                    ? <div key={i} style={{ height: 1, background: t.border, margin: '4px 8px' }} />
                    : (
                      <div key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', cursor: 'pointer', borderRadius: 0 }}
                        onMouseEnter={e => e.currentTarget.style.background = t.accent + '22'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { item.action(); setMenuOpen(null); }}
                      >
                        <i className={`codicon ${item.icon}`} style={{ color: t.accent, fontSize: 14, flexShrink: 0, width: 16 }} />
                        <span style={{ fontSize: 12, color: t.text, flex: 1 }}>{item.label}</span>
                        {item.shortcut && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: 'monospace' }}>{item.shortcut}</span>}
                      </div>
                    )
                )}
              </div>
            )}
          </div>
        ))}

        {/* Center Search Box */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '3px 10px', width: '100%', maxWidth: 380, cursor: 'text' }}
            onClick={() => { setActiveActivity('search'); setSidebarOpen(true); }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.boxShadow = `0 0 0 1px ${t.accent}44`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <i className="codicon codicon-search" style={{ color: t.textMuted, fontSize: 13, flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
              placeholder="Search files, commands..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (e.target.value) { setActiveActivity('search'); setSidebarOpen(true); doSearch(e.target.value); } }}
              onKeyDown={e => { if (e.key === 'Enter') { setActiveActivity('search'); setSidebarOpen(true); doSearch(searchQuery); } if (e.key === 'Escape') e.target.blur(); }}
              onClick={e => e.stopPropagation()}
            />
            <kbd style={{ fontSize: 10, color: t.textMuted, background: t.border + '88', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0 }}>Ctrl+P</kbd>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: t.border, marginRight: 10, flexShrink: 0 }} />

        {/* Project Switcher */}
        <div style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, color: t.textMuted, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={e => { e.stopPropagation(); setProjectsOpen(p => !p); setMenuOpen(null); }}
            onMouseEnter={e => e.currentTarget.style.background = t.border}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.accent }} />
            {projectName}
            <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
          </span>
          {projectsOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 300, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 10, color: t.textMuted, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Projects</p>
              {projects.map((p, i) => (
                <div key={i}
                  onClick={() => { switchProject(p); setProjectsOpen(false); }}
                  style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: p.path === currentDir ? t.accent : t.text, background: p.path === currentDir ? t.accent + '22' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = t.border}
                  onMouseLeave={e => e.currentTarget.style.background = p.path === currentDir ? t.accent + '22' : 'transparent'}
                >
                  <i className="codicon codicon-folder" style={{ color: t.accent, fontSize: 13 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: p.path === currentDir ? t.accent : t.text }}>{p.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: t.textMuted }}>{p.path.slice(0, 35)}...</p>
                  </div>
                </div>
              ))}
              {projects.length === 0 && <p style={{ fontSize: 11, color: t.textMuted, padding: '6px 10px' }}>No recent projects</p>}
              <div style={{ borderTop: `0.5px solid ${t.border}`, marginTop: 4, paddingTop: 4 }}>
                <div onClick={() => { openFolder(); setProjectsOpen(false); }}
                  style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: t.accent, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = t.border}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <i className="codicon codicon-folder-opened" style={{ fontSize: 13 }} />
                  Open New Folder
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{ display: "flex", gap: 5, alignItems: "center", padding: '0 10px', borderLeft: `0.5px solid ${t.border}`, borderRight: `0.5px solid ${t.border}` }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#f0883e" : "#3fb950", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap' }}>{loading ? "Working..." : "Ready"}</span>
        </div>

        {/* Theme Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            style={{ background: 'transparent', border: 'none', borderRadius: 5, color: t.textMuted, padding: "0 10px", fontSize: 11, cursor: "pointer", display: 'flex', alignItems: 'center', gap: 5, height: 36 }}
            onClick={e => { e.stopPropagation(); setThemeOpen(p => !p); setMenuOpen(null); }}
            onMouseEnter={e => e.currentTarget.style.background = t.border}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />
            {t.name}
          </button>
          {themeOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 300, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}>
              {Object.entries(THEMES).map(([key, th]) => (
                <div key={key} onClick={() => { setTheme(key); setThemeOpen(false); }}
                  style={{ padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: key === theme ? t.accent : t.text, background: key === theme ? t.accent + '22' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = t.border}
                  onMouseLeave={e => e.currentTarget.style.background = key === theme ? t.accent + '22' : 'transparent'}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: th.accent }} />
                  {th.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Activity Bar */}
        <div style={{ width: 44, background: t.activityBar, borderLeft: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 2, flexShrink: 0 }}>
          {activityItems.map(item => (
            <button key={item.id} title={item.title}
              style={{ width: 36, height: 36, background: activeActivity === item.id ? t.border : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: activeActivity === item.id ? `2px solid ${t.accent}` : '2px solid transparent' }}
              onClick={() => {
                if (activeActivity === item.id) setSidebarOpen(p => !p);
                else { setActiveActivity(item.id); setSidebarOpen(true); }
              }}
              onMouseEnter={e => { if (activeActivity !== item.id) e.currentTarget.style.background = t.border + '66' }}
              onMouseLeave={e => { if (activeActivity !== item.id) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`codicon ${item.icon}`} style={{ color: activeActivity === item.id ? t.accent : t.textMuted, fontSize: 18 }} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button title="Open Folder" style={{ width: 36, height: 36, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}
            onClick={openFolder}
            onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <i className="codicon codicon-folder-opened" style={{ color: t.textMuted, fontSize: 18 }} />
          </button>
        </div>

        {/* Sidebar */}
        {sidebarOpen && <div style={{ width: sidebarWidth, background: t.sidebar, borderLeft: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 500 }}>
              {activeActivity === 'explorer' ? 'EXPLORER' : activeActivity === 'search' ? 'SEARCH' : activeActivity === 'git' ? 'GIT' : 'EXTENSIONS'}
            </span>
            <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14 }}
              onClick={() => { const name = prompt("File name:"); if (name) setFiles(prev => [...prev, { name, content: "" }]); }}>+</button>
          </div>
          {activeActivity === 'explorer' && (
            <div style={{ overflowY: "auto", flex: 1, paddingTop: 4 }}>
              {fileTree.length > 0
                ? fileTree.map(item => <FileTreeNode key={item.path} item={item} level={0} activeFile={activeFile} onFileClick={onFileClick} t={t} />)
                : files.map(f => (
                  <div key={f.name}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", cursor: "pointer", background: f.name === activeFile ? t.accent + '22' : 'transparent', borderRight: f.name === activeFile ? `2px solid ${t.accent}` : '2px solid transparent' }}
                    onClick={() => setActiveFile(f.name)}
                    onMouseEnter={e => { if (f.name !== activeFile) e.currentTarget.style.background = t.border + '66' }}
                    onMouseLeave={e => { if (f.name !== activeFile) e.currentTarget.style.background = 'transparent' }}
                  >
                    {(() => { const { icon, color } = getFileIcon(f.name); return <i className={`codicon ${icon}`} style={{ color, fontSize: 14 }} />; })()}
                    <span style={{ fontSize: 12, color: f.name === activeFile ? t.text : t.textMuted }}>{f.name}</span>
                  </div>
                ))
              }
            </div>
          )}
          {activeActivity === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
                <input
                  style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none' }}
                  placeholder="Search in files..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSearch(searchQuery); }}
                  dir="auto"
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {searching && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Searching...</p>}
                {searchResults.length === 0 && !searching && searchQuery && (
                  <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No results found</p>
                )}
                {(() => {
                  // تجميع النتائج حسب الملف
                  const grouped = searchResults.reduce((acc, r) => {
                    if (!acc[r.file]) acc[r.file] = { path: r.path, lines: [] };
                    acc[r.file].lines.push(r);
                    return acc;
                  }, {});

                  return Object.entries(grouped).map(([file, data]) => (
                    <div key={file} style={{ marginBottom: 4 }}>
                      {/* اسم الملف */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: t.border + '33', position: 'sticky', top: 0 }}>
                        {(() => { const { icon, color } = getFileIcon(file); return <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />; })()}
                        <span style={{ fontSize: 11, color: t.accent, fontWeight: 500 }}>{file}</span>
                        <span style={{ fontSize: 10, color: t.textMuted, marginRight: 'auto' }}>{data.lines.length} result{data.lines.length !== 1 ? 's' : ''}</span>
                      </div>
                      {/* السطور */}
                      {data.lines.map((r, i) => (
                        <div key={i}
                          style={{ padding: '4px 10px 4px 20px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}
                          onClick={() => onFileClick({ name: r.file, path: r.path, type: 'file' })}
                          onMouseEnter={e => e.currentTarget.style.background = t.accent + '11'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 10, color: t.textMuted, fontFamily: 'monospace', minWidth: 28, textAlign: 'left', flexShrink: 0 }}>{r.line}</span>
                          <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text}</span>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
          {activeActivity === 'git' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
                <button
                  style={{ width: '100%', background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginBottom: 6 }}
                  onClick={loadGitStatus}
                >
                  <i className="codicon codicon-refresh" style={{ fontSize: 12 }} /> Refresh
                </button>
                <input
                  style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none', marginBottom: 6 }}
                  placeholder="Commit message..."
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doCommit(); }}
                  dir="auto"
                />
                <button
                  style={{ width: '100%', background: gitFiles.length > 0 ? '#238636' : t.border, border: 'none', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
                  onClick={doCommit}
                  disabled={gitFiles.length === 0}
                >
                  <i className="codicon codicon-check" style={{ fontSize: 12 }} /> Commit ({gitFiles.length})
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Loading...</p>}
                {gitFiles.length === 0 && !gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No changes</p>}
                {gitFiles.map((f, i) => (
                  <div key={i}
                    style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: f.status === 'M' ? '#f0883e' : f.status === 'A' ? '#3fb950' : f.status === 'D' ? '#ff7b72' : t.accent, minWidth: 16 }}>
                      {f.status}
                    </span>
                    <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.file}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeActivity === 'extensions' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
                <input
                  style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none' }}
                  placeholder="Search extensions..."
                  value={extSearchQuery}
                  onChange={e => {
                    setExtSearchQuery(e.target.value);
                    searchExtensions(e.target.value);
                  }}
                  dir="auto"
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {extSearching && (
                  <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Searching...</p>
                )}
                {!extSearching && extSearchResults.length === 0 && extSearchQuery === '' && (
                  <div style={{ padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🧩</div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: t.text, margin: '0 0 8px' }}>
                      Extensions Marketplace
                    </h3>
                    <p style={{ fontSize: 11, color: t.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
                      Search for VS Code extensions to install
                    </p>
                  </div>
                )}
                {!extSearching && extSearchResults.length === 0 && extSearchQuery !== '' && (
                  <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No results found</p>
                )}
                {extSearchResults.map((ext, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderBottom: `0.5px solid ${t.border}33`,
                    }}
                    onClick={() => setSelectedExtension(ext)}
                    onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <img
                      src={ext.icon || ext.files?.icon}
                      alt={ext.name}
                      style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'contain' }}
                      onError={e => e.target.style.display = 'none'}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: t.text, fontWeight: 500, marginBottom: 2 }}>
                        {ext.displayName || ext.name}
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ext.description || ext.shortDescription}
                      </div>
                    </div>
                    {isExtensionInstalled(ext.id) ? (
                      <span style={{ fontSize: 10, color: '#3fb950', fontWeight: 500 }}>✓ Installed</span>
                    ) : (
                      <button
                        style={{
                          background: t.accent,
                          border: 'none',
                          borderRadius: 4,
                          color: '#fff',
                          padding: '4px 8px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          installExtension(ext);
                        }}
                      >
                        Install
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}

        {/* Resize Handle */}
        <div style={{ width: 3, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseDown={startSidebarResize}
          onMouseEnter={e => e.currentTarget.style.background = t.accent}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />

        {/* Editor + Terminal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tabs */}
          <div style={{ display: "flex", background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, overflowX: "auto" }}>
            {files.slice(0, 8).map(f => {
              const { icon, color } = getFileIcon(f.name);
              const isActive = f.name === activeFile;
              return (
                <div key={f.name}
                  style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: isActive ? t.text : t.textMuted, borderBottom: isActive ? `2px solid ${t.accent}` : `2px solid transparent`, background: isActive ? t.bg : 'transparent', whiteSpace: "nowrap", display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10 }}
                  onClick={() => setActiveFile(f.name)}
                >
                  <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />
                  {f.name}
                  <span
                    style={{ fontSize: 14, color: t.textMuted, marginRight: 2, lineHeight: 1, padding: '0 2px', borderRadius: 3, opacity: isActive ? 1 : 0 }}
                    onClick={e => {
                      e.stopPropagation();
                      const remaining = files.filter(file => file.name !== f.name);
                      setFiles(remaining);
                      if (activeFile === f.name && remaining.length > 0) {
                        setActiveFile(remaining[remaining.length - 1].name);
                      } else if (activeFile === f.name) {
                        setActiveFile('');
                      }
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.border; e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = isActive ? '1' : '0'; }}
                  >×</span>
                </div>
              );
            })}
          </div>

          {/* Breadcrumb */}
          <div style={{ padding: "3px 12px", background: t.bg, borderBottom: `0.5px solid ${t.border}`, fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.textMuted }} />
            <span>{projectName}</span>
            <span>›</span>
            <span style={{ color: t.text }}>{activeFile}</span>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {selectedExtension ? (
              <div style={{ padding: 40, overflowY: 'auto', height: '100%', position: 'relative' }}>
                <button
                  style={{ position: 'absolute', top: 20, right: 20, background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '8px 12px', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
                  onClick={() => setSelectedExtension(null)}
                  title="Close"
                >
                  <i className="codicon codicon-close" style={{ fontSize: 16 }} />
                </button>
                
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                    <img
                      src={selectedExtension.icon || selectedExtension.files?.icon}
                      alt={selectedExtension.name}
                      style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'contain' }}
                      onError={e => e.target.style.display = 'none'}
                    />
                    <div>
                      <h1 style={{ fontSize: 24, fontWeight: 600, color: t.text, marginBottom: 8 }}>
                        {selectedExtension.displayName || selectedExtension.name}
                      </h1>
                      <div style={{ display: 'flex', gap: 16, fontSize: 14, color: t.textMuted }}>
                        <span>v{selectedExtension.version}</span>
                        <span>👤 {selectedExtension.publisher || selectedExtension.namespace}</span>
                        <span>⬇️ {selectedExtension.downloadCount || selectedExtension.downloads || 0} downloads</span>
                      </div>
                    </div>
                  </div>
                  
                  <p style={{ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 24 }}>
                    {selectedExtension.description || selectedExtension.shortDescription}
                  </p>
                  
                  <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                    {isExtensionInstalled(selectedExtension.id) ? (
                      <button
                        style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                        onClick={() => uninstallExtension(selectedExtension.id)}
                      >
                        ❌ Uninstall
                      </button>
                    ) : (
                      <button
                        style={{ background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                        onClick={() => installExtension(selectedExtension)}
                      >
                        📥 Install Extension
                      </button>
                    )}
                  </div>
                  
                  {selectedExtension.tags && selectedExtension.tags.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 12 }}>Tags</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {selectedExtension.tags.map((tag, i) => (
                          <span key={i} style={{ background: t.border, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: t.textMuted }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeFile && currentFile ? (
              <Editor
                height="100%"
                language={activeFile.endsWith(".jsx") || activeFile.endsWith(".js") ? "javascript" : activeFile.endsWith(".ts") || activeFile.endsWith(".tsx") ? "typescript" : activeFile.endsWith(".css") ? "css" : activeFile.endsWith(".html") ? "html" : activeFile.endsWith(".php") ? "php" : activeFile.endsWith(".py") ? "python" : activeFile.endsWith(".json") ? "json" : "plaintext"}
                value={currentFile?.content || ""}
                onChange={val => setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: val } : f))}
                theme={t.editorTheme}
                options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "JetBrains Mono, Consolas, monospace", wordWrap: "on", lineNumbers: "on" }}
              />
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.bg,
                gap: 24,
                userSelect: 'none',
              }}>
                <style>{`
                  @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                  }
                `}</style>
                
                <div style={{ fontSize: 80, animation: 'float 3s ease-in-out infinite' }}>
                  🐙
                </div>
                
                <div style={{ textAlign: 'center' }}>
                  <h1 style={{ 
                    fontSize: 28, fontWeight: 700, color: t.text, margin: 0,
                    letterSpacing: '-0.5px'
                  }}>
                    Octopus AI
                  </h1>
                  <p style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>
                    AI-powered multi-leg code editor
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {[
                    { key: 'Ctrl+O', label: 'Open Folder' },
                    { key: 'Ctrl+P', label: 'Quick Search' },
                    { key: 'Ctrl+`', label: 'Open Terminal' },
                  ].map(item => (
                    <div key={item.key} style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '6px 16px', borderRadius: 6,
                      background: t.sidebar, border: `0.5px solid ${t.border}`,
                    }}>
                      <kbd style={{
                        fontSize: 11, color: t.accent,
                        background: t.bg, border: `0.5px solid ${t.border}`,
                        borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace',
                      }}>
                        {item.key}
                      </kbd>
                      <span style={{ fontSize: 12, color: t.textMuted }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <div style={{ height: terminalHeight, borderTop: `0.5px solid ${t.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ height: 3, cursor: 'row-resize', background: 'transparent' }}
                onMouseDown={startTerminalResize}
                onMouseEnter={e => e.currentTarget.style.background = t.accent}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              />
              <div style={{ display: 'flex', alignItems: 'center', background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
                {['terminal', 'problems', 'output'].map(tab => (
                  <button key={tab} onClick={() => setTerminalTab(tab)}
                    style={{ padding: '5px 14px', fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', color: terminalTab === tab ? t.text : t.textMuted, borderBottom: terminalTab === tab ? `1px solid ${t.accent}` : '1px solid transparent', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {tab === 'terminal' ? 'TERMINAL' : tab === 'problems' ? 'PROBLEMS' : 'OUTPUT'}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={() => setTerminalHistory([{ type: 'system', text: '🐙 Terminal ready' }])}>
                  <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
                </button>
                <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={() => setTerminalOpen(false)}>
                  <i className="codicon codicon-close" style={{ fontSize: 14 }} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', background: t.bg, fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
                {terminalTab === 'terminal' && terminalHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: 12, color: h.type === 'input' ? t.accent : h.type === 'error' ? '#ff7b72' : h.type === 'system' ? '#7ee787' : t.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{h.text}</div>
                ))}
                {terminalTab === 'problems' && <p style={{ fontSize: 12, color: t.textMuted }}>No problems</p>}
                {terminalTab === 'output' && <p style={{ fontSize: 12, color: t.textMuted }}>No output</p>}
                <div ref={terminalBottomRef} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
                <span style={{ color: t.accent, fontFamily: 'monospace', fontSize: 13 }}>$</span>
                <input
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12 }}
                  value={terminalInput}
                  onChange={e => setTerminalInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runCommand(terminalInput); }}
                  placeholder="Enter command..."
                  dir="ltr"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - AI */}
        <div style={{ display: "flex", flexShrink: 0 }}>

          {/* Right Panel Bar */}
          <div style={{ width: 40, background: t.activityBar, borderRight: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 6, gap: 2, flexShrink: 0, order: 2 }}>
            {[
              { id: 'chat',    icon: 'codicon-comment-discussion', title: 'Chat' },
              { id: 'legs',    icon: 'codicon-pulse',              title: 'Legs' },
              { id: 'context', icon: 'codicon-list-tree',          title: 'Context' },
              { id: 'history', icon: 'codicon-history',            title: 'History' },
            ].map(item => (
              <button key={item.id} title={item.title}
                style={{ width: 32, height: 32, background: rightPanelTab === item.id ? t.border : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: rightPanelTab === item.id ? `2px solid ${t.accent}` : '2px solid transparent', position: 'relative' }}
                onClick={() => {
                  if (rightPanelTab === item.id) setRightPanelOpen(p => !p);
                  else { setRightPanelTab(item.id); setRightPanelOpen(true); }
                }}
                onMouseEnter={e => { if (rightPanelTab !== item.id) e.currentTarget.style.background = t.border + '66' }}
                onMouseLeave={e => { if (rightPanelTab !== item.id) e.currentTarget.style.background = 'transparent' }}
              >
                <i className={`codicon ${item.icon}`} style={{ color: rightPanelTab === item.id ? t.accent : t.textMuted, fontSize: 16 }} />
                {item.id === 'chat' && loading && (
                  <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f0883e' }} />
                )}
                {item.id === 'legs' && legs.some(l => l.status === 'working') && (
                  <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f0883e' }} />
                )}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button title="Clear Chat"
              style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}
              onClick={reset}
              onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <i className="codicon codicon-clear-all" style={{ color: t.textMuted, fontSize: 16 }} />
            </button>
          </div>

          {/* Right Panel Content */}
          {rightPanelOpen && <div style={{ width: 260, background: t.sidebar, borderRight: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, order: 1 }}>

            {/* Panel Header */}
            <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={`codicon ${rightPanelTab === 'chat' ? 'codicon-comment-discussion' : rightPanelTab === 'legs' ? 'codicon-pulse' : rightPanelTab === 'context' ? 'codicon-list-tree' : 'codicon-history'}`} style={{ color: t.accent, fontSize: 13 }} />
              <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {rightPanelTab === 'chat' ? 'CHAT' : rightPanelTab === 'legs' ? 'EIGHT LEGS' : rightPanelTab === 'context' ? 'CONTEXT' : 'HISTORY'}
              </span>
            </div>

            {/* Legs Tab */}
            {rightPanelTab === 'legs' && (
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
                {legs.map(leg => (
                  <div key={leg.id} style={{ background: t.bg, border: `0.5px solid ${leg.status === "done" ? "#238636" : leg.status === "working" ? "#9e6a03" : t.border}`, borderRadius: 6, padding: "7px 10px", opacity: leg.status === "idle" ? 0.4 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: legColor(leg.status), flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: legColor(leg.status), fontWeight: 500 }}>{leg.name}</span>
                      <span style={{ marginRight: 'auto', fontSize: 10, color: t.textMuted }}>{leg.progress}%</span>
                    </div>
                    <p style={{ fontSize: 10, color: t.textMuted, margin: "0 0 4px" }}>{leg.task}</p>
                    <div style={{ background: t.border, borderRadius: 3, height: 2 }}>
                      <div style={{ background: leg.status === "done" ? "#3fb950" : "#f0883e", width: `${leg.progress}%`, height: "100%", borderRadius: 3, transition: "width 0.2s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Tab */}
            {rightPanelTab === 'chat' && (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: m.role === 'octopus' ? t.accent + '33' : t.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                          {m.role === 'octopus' ? '🐙' : '👤'}
                        </div>
                        <span style={{ fontSize: 10, color: m.role === "octopus" ? t.accent : t.textMuted, fontWeight: 500 }}>
                          {m.role === "octopus" ? "Octopus" : "You"}
                        </span>
                      </div>
                      <div style={{ marginRight: 23, background: m.role === 'octopus' ? t.bg : t.accent + '11', borderRadius: '0 8px 8px 8px', padding: '6px 10px', border: `0.5px solid ${t.border}` }}>
                        <p style={{ fontSize: 11, color: t.text, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {m.text}
                        </p>
                      </div>
                    </div>
                  ))}
                  {awaitingConfirm && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingRight: 23 }}>
                      <button style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }} onClick={executeApprovedPlan}>
                        ✅ Approve — Execute
                      </button>
                      <button style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }} onClick={cancelPlan}>
                        ❌ Cancel
                      </button>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div style={{ padding: "8px 10px", borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '6px 8px' }}>
                    <textarea
                      style={{ flex: 1, background: 'transparent', color: t.text, border: 'none', outline: 'none', fontSize: 12, resize: 'none', fontFamily: "'Inter', 'Segoe UI', sans-serif", lineHeight: 1.5 }}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={onKey}
                      placeholder="Type your command..."
                      rows={2}
                      dir="ltr"
                    />
                    <button
                      style={{ background: loading ? t.border : t.accent, border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      onClick={send} disabled={loading}
                    >
                      <i className={`codicon ${loading ? 'codicon-loading' : 'codicon-send'}`} style={{ fontSize: 14 }} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}
                      onClick={() => setTerminalOpen(p => !p)}>
                      <i className="codicon codicon-terminal" style={{ fontSize: 12 }} /> Terminal
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Context Tab */}
            {rightPanelTab === 'context' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>Open files in context</p>
                {files.filter(f => f.content).length === 0
                  ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No open files</p>
                  : files.filter(f => f.content).slice(0, 5).map((f, i) => {
                      const { icon, color } = getFileIcon(f.name);
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: f.name === activeFile ? t.accent + '11' : t.bg, border: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                          onClick={() => setActiveFile(f.name)}>
                          <i className={`codicon ${icon}`} style={{ color, fontSize: 13 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                            <p style={{ fontSize: 10, color: t.textMuted, margin: 0 }}>{f.content?.split('\n').length || 0} lines</p>
                          </div>
                          {f.name === activeFile && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />}
                        </div>
                      );
                    })
                }
                {files.filter(f => f.content).length > 5 && (
                  <p style={{ fontSize: 10, color: t.textMuted, marginTop: 6 }}>+ {files.filter(f => f.content).length - 5} more files</p>
                )}
                <div style={{ marginTop: 16, padding: '10px 12px', background: t.bg, borderRadius: 8, border: `0.5px solid ${t.border}` }}>
                  <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Project</p>
                  <p style={{ fontSize: 12, color: t.text, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="codicon codicon-folder" style={{ color: t.accent, fontSize: 13 }} />
                    {projectName}
                  </p>
                  {currentDir && <p style={{ fontSize: 10, color: t.textMuted, margin: '4px 0 0', wordBreak: 'break-all' }}>{currentDir}</p>}
                </div>
              </div>
            )}

            {/* History Tab */}
            {rightPanelTab === 'history' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>Command history</p>
                {messages.filter(m => m.role === 'user').length === 0
                  ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No previous commands</p>
                  : messages.filter(m => m.role === 'user').map((m, i) => (
                    <div key={i} style={{ padding: '7px 10px', borderRadius: 6, marginBottom: 4, background: t.bg, border: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                      onClick={() => { setInput(m.text); setRightPanelTab('chat'); }}
                      onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
                      onMouseLeave={e => e.currentTarget.style.background = t.bg}
                    >
                      <p style={{ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</p>
                    </div>
                  ))
                }
              </div>
            )}

          </div>}
        </div>
      </div>

      <OctopusWorking active={loading} legs={legs} />

      {/* Status Bar */}
      <div style={{ height: 22, background: t.statusBar, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="codicon codicon-source-control" style={{ fontSize: 12 }} /> main
        </span>
        <button
          onClick={toggleRun}
          style={{
            background: isRunning ? '#da3633' : '#2ea043',
            border: 'none', borderRadius: 4, cursor: 'pointer',
            color: '#fff', padding: '1px 8px', fontSize: 11,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <i className={`codicon ${isRunning ? 'codicon-stop-circle' : 'codicon-play'}`} style={{ fontSize: 12 }} />
          {isRunning ? 'Stop' : 'Run'}
        </button>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>🐙 Octopus AI</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          {activeFile} • {currentFile?.content?.split('\n').length || 0} lines
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>UTF-8</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }} onClick={() => setThemeOpen(p => !p)}>
          {t.name}
        </span>
      </div>
    </div>
  );
}
