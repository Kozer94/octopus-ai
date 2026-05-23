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
  { id: 1, name: "رجل الكتابة", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 2, name: "رجل الفحص", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 3, name: "رجل التعديل", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 4, name: "رجل الاختبار", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 5, name: "رجل الإدارة", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 6, name: "رجل التوليد", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 7, name: "رجل التحديث", status: "idle", task: "تنتظر...", progress: 0 },
  { id: 8, name: "رجل الدمج", status: "idle", task: "تنتظر...", progress: 0 },
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
      <div style={{ position: 'relative', width: 80, height: 80 }}>
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

        <svg width="80" height="80" viewBox="0 0 80 80" style={{ animation: 'octopusBob 1.2s ease-in-out infinite' }}>
          <ellipse cx="40" cy="30" rx="22" ry="20" fill="#7dd3fc" opacity="0.95" />
          <ellipse cx="40" cy="22" rx="18" ry="16" fill="#7dd3fc" />
          <g style={{ animation: 'octopusBlink 3s infinite', transformOrigin: '40px 20px' }}>
            <circle cx="33" cy="20" r="4" fill="white" />
            <circle cx="47" cy="20" r="4" fill="white" />
            <circle cx="34" cy="21" r="2.5" fill="#0d1117" />
            <circle cx="48" cy="21" r="2.5" fill="#0d1117" />
            <circle cx="34.8" cy="20.2" r="0.8" fill="white" />
            <circle cx="48.8" cy="20.2" r="0.8" fill="white" />
          </g>
          <path d="M34 27 Q40 31 46 27" stroke="#0d1117" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const x = 18 + i * 6.5;
            const delay = i * 0.15;
            return (
              <g key={i} style={{ transformOrigin: `${x}px 45px`, animation: `${i % 2 === 0 ? 'tentacle1' : 'tentacle2'} ${0.8 + i * 0.1}s ease-in-out infinite`, animationDelay: `${delay}s` }}>
                <path d={`M${x} 45 Q${x - 4 + i} ${55 + i} ${x - 2} 65`} stroke="#7dd3fc" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
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
          <span style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 500 }}>أخطبوط يعمل...</span>
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
  const [files, setFiles] = useState([{ name: "App.jsx", content: "// ابدأ بكتابة أمرك لأخطبوط\n" }]);
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState("App.jsx");
  const [legs, setLegs] = useState(INITIAL_LEGS);
  const [messages, setMessages] = useState([{ role: "octopus", text: "مرحباً 🐙 أنا جاهز. أخبرني ماذا تريد أن تبني." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [themeOpen, setThemeOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState([{ type: 'system', text: '🐙 Terminal جاهز' }]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalTab, setTerminalTab] = useState('terminal');
  const [currentDir, setCurrentDir] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [terminalHeight, setTerminalHeight] = useState(180);
  const [activeActivity, setActiveActivity] = useState('explorer');
  const [projectName, setProjectName] = useState('أخطبوط');
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
  const bottomRef = useRef(null);
  const terminalBottomRef = useRef(null);
  const t = THEMES[theme];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [terminalHistory]);

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
    if (data.success) { setFileTree(data.items); setFiles([]); setGitFiles([]); }
  }

  async function switchProject(project) {
    setProjectName(project.name);
    setCurrentDir(project.path);
    setFiles([]);
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
      const res = await fetch(`${BACKEND}/api/terminal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd, cwd: currentDir }) });
      const data = await res.json();
      setTerminalHistory(prev => [...prev, { type: data.success ? 'output' : 'error', text: data.output || data.error || '' }]);
    } catch { setTerminalHistory(prev => [...prev, { type: 'error', text: '⚠️ تعذّر تشغيل الأمر' }]); }
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
    setTerminalHistory(prev => [...prev, { type: 'system', text: `🚀 تشغيل: ${command}` }]);

    try {
      const res = await fetch(`${BACKEND}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: currentDir }),
      });
      const data = await res.json();
      setTerminalHistory(prev => [...prev, { type: 'output', text: data.output }]);
    } catch {
      setTerminalHistory(prev => [...prev, { type: 'error', text: '⚠️ خطأ في التشغيل' }]);
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
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);
    resetLegs();
    activateLeg(1, "تحلل الطلب...");
    activateLeg(2, "تفحص الملفات...");
    const currentFile = files.find(f => f.name === activeFile);
    try {
      const isComplexTask = text.length > 30 || text.includes('أضف') || text.includes('أنشئ') || text.includes('بني') || text.includes('create') || text.includes('add');
      const endpoint = isComplexTask ? '/api/octopus/parallel' : '/api/octopus';
      const res = await fetch(`${BACKEND}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: text, sessionId: SESSION_ID, activeFile, activeFileContent: currentFile?.content || "" }) });
      const data = await res.json();
      // عرض خطة الأرجل إذا كان parallel
      if (data.plan) {
        data.plan.tasks.forEach(task => {
          activateLeg(task.leg, task.task);
        });
        setMessages(prev => [...prev, {
          role: 'octopus',
          text: `🐙 خطة العمل:\n${data.plan.tasks.map(t => `• ${t.name}: ${t.task}`).join('\n')}\n\n${data.plan.summary}`
        }]);
      }
      completeLeg(1); completeLeg(2);
      activateLeg(3, "تعدّل الكود..."); activateLeg(6, "تولّد الكود...");
      if (data.success) {
        const terminalMatch = data.result.match(/<terminal>(.*?)<\/terminal>/s);
        if (terminalMatch) { await runCommand(terminalMatch[1].trim()); }
        setTimeout(async () => {
          completeLeg(3); completeLeg(6); activateLeg(8, "تدمج النتائج...");
          const code = extractCode(data.result);
          if (code) {
            setFiles(prev => { const exists = prev.find(f => f.name === activeFile); if (exists) return prev.map(f => f.name === activeFile ? { ...f, content: code } : f); return [...prev, { name: activeFile, content: code }]; });
            if (currentFile?.path) {
              await fetch(`${BACKEND}/api/files/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath: currentFile.path, content: code }) });
            }
          }
          setTimeout(() => completeLeg(8), 600);
          setMessages(prev => [...prev, { role: "octopus", text: data.result }]);
        }, 800);
      } else { setMessages(prev => [...prev, { role: "octopus", text: `خطأ: ${data.error}` }]); resetLegs(); }
    } catch { setMessages(prev => [...prev, { role: "octopus", text: "⚠️ تعذّر الاتصال بالخادم." }]); resetLegs(); }
    setLoading(false);
  }

  async function reset() {
    await fetch(`${BACKEND}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SESSION_ID }) });
    setMessages([{ role: "octopus", text: "تم مسح المحادثة 🐙" }]);
  }

  function onKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  const currentFile = files.find(f => f.name === activeFile);
  const legColor = (s) => s === "done" ? "#3fb950" : s === "working" ? "#f0883e" : t.textMuted;

  const activityItems = [
    { id: 'explorer', icon: 'codicon-files', title: 'مستكشف الملفات' },
    { id: 'search', icon: 'codicon-search', title: 'بحث' },
    { id: 'git', icon: 'codicon-source-control', title: 'Git' },
    { id: 'extensions', icon: 'codicon-extensions', title: 'إضافات' },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: t.bg, color: t.text, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 12px", height: 35, background: t.activityBar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 18 }}>🐙</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: t.accent }}>أخطبوط</span>
        <div style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, color: t.textMuted, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
            onClick={() => setProjectsOpen(p => !p)}
            onMouseEnter={e => e.currentTarget.style.background = t.border}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            — {projectName} ▾
          </span>
          {projectsOpen && projects.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 100, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              <p style={{ fontSize: 10, color: t.textMuted, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>المشاريع الأخيرة</p>
              {projects.map((p, i) => (
                <div key={i}
                  onClick={() => switchProject(p)}
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
              <div style={{ borderTop: `0.5px solid ${t.border}`, marginTop: 4, paddingTop: 4 }}>
                <div
                  onClick={openFolder}
                  style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: t.accent, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = t.border}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <i className="codicon codicon-folder-opened" style={{ fontSize: 13 }} />
                  فتح مجلد جديد
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#f0883e" : "#3fb950" }} />
          <span style={{ fontSize: 11, color: t.textMuted }}>{loading ? "يعمل..." : "جاهز"}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            style={{ background: 'transparent', border: `0.5px solid ${t.border}`, borderRadius: 5, color: t.textMuted, padding: "3px 8px", fontSize: 11, cursor: "pointer", display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setThemeOpen(p => !p)}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />
            {t.name}
          </button>
          {themeOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 100, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
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
              onClick={() => setActiveActivity(item.id)}
              onMouseEnter={e => { if (activeActivity !== item.id) e.currentTarget.style.background = t.border + '66' }}
              onMouseLeave={e => { if (activeActivity !== item.id) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`codicon ${item.icon}`} style={{ color: activeActivity === item.id ? t.accent : t.textMuted, fontSize: 18 }} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button title="فتح مجلد" style={{ width: 36, height: 36, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}
            onClick={openFolder}
            onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <i className="codicon codicon-folder-opened" style={{ color: t.textMuted, fontSize: 18 }} />
          </button>
        </div>

        {/* Sidebar */}
        <div style={{ width: sidebarWidth, background: t.sidebar, borderLeft: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 500 }}>
              {activeActivity === 'explorer' ? 'مستكشف' : activeActivity === 'search' ? 'بحث' : activeActivity === 'git' ? 'Git' : 'إضافات'}
            </span>
            <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14 }}
              onClick={() => { const name = prompt("اسم الملف:"); if (name) setFiles(prev => [...prev, { name, content: "" }]); }}>+</button>
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
                  placeholder="ابحث في الملفات..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSearch(searchQuery); }}
                  dir="auto"
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {searching && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>جاري البحث...</p>}
                {searchResults.length === 0 && !searching && searchQuery && (
                  <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>لا توجد نتائج</p>
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
                        <span style={{ fontSize: 10, color: t.textMuted, marginRight: 'auto' }}>{data.lines.length} نتيجة</span>
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
                  <i className="codicon codicon-refresh" style={{ fontSize: 12 }} /> تحديث
                </button>
                <input
                  style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none', marginBottom: 6 }}
                  placeholder="رسالة الـ commit..."
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
                {gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>جاري التحميل...</p>}
                {gitFiles.length === 0 && !gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>لا توجد تغييرات</p>}
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
        </div>

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
            <Editor
              height="100%"
              language={activeFile.endsWith(".jsx") || activeFile.endsWith(".js") ? "javascript" : activeFile.endsWith(".ts") || activeFile.endsWith(".tsx") ? "typescript" : activeFile.endsWith(".css") ? "css" : activeFile.endsWith(".html") ? "html" : activeFile.endsWith(".php") ? "php" : activeFile.endsWith(".py") ? "python" : activeFile.endsWith(".json") ? "json" : "plaintext"}
              value={currentFile?.content || ""}
              onChange={val => setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: val } : f))}
              theme={t.editorTheme}
              options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "JetBrains Mono, Consolas, monospace", wordWrap: "on", lineNumbers: "on" }}
            />
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
                <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={() => setTerminalHistory([{ type: 'system', text: '🐙 Terminal جاهز' }])}>
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
                {terminalTab === 'problems' && <p style={{ fontSize: 12, color: t.textMuted }}>لا توجد مشاكل</p>}
                {terminalTab === 'output' && <p style={{ fontSize: 12, color: t.textMuted }}>لا يوجد output</p>}
                <div ref={terminalBottomRef} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
                <span style={{ color: t.accent, fontFamily: 'monospace', fontSize: 13 }}>$</span>
                <input
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12 }}
                  value={terminalInput}
                  onChange={e => setTerminalInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runCommand(terminalInput); }}
                  placeholder="اكتب أمراً..."
                  dir="ltr"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - AI */}
        <div style={{ width: 260, background: t.sidebar, borderRight: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="codicon codicon-sparkle" style={{ color: t.accent, fontSize: 14 }} />
            <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>الأرجل الثمانية</span>
          </div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 5, overflowY: "auto", maxHeight: 260 }}>
            {legs.map(leg => (
              <div key={leg.id} style={{ background: t.bg, border: `0.5px solid ${leg.status === "done" ? "#238636" : leg.status === "working" ? "#9e6a03" : t.border}`, borderRadius: 6, padding: "7px 10px", opacity: leg.status === "idle" ? 0.4 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: legColor(leg.status), flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: legColor(leg.status), fontWeight: 500 }}>{leg.name}</span>
                </div>
                <p style={{ fontSize: 10, color: t.textMuted, margin: "0 0 4px" }}>{leg.task}</p>
                <div style={{ background: t.border, borderRadius: 3, height: 2 }}>
                  <div style={{ background: leg.status === "done" ? "#3fb950" : "#f0883e", width: `${leg.progress}%`, height: "100%", borderRadius: 3, transition: "width 0.2s ease" }} />
                </div>
              </div>
            ))}
          </div>

          {/* AI Chat */}
          <div style={{ borderTop: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
            <i className="codicon codicon-comment-discussion" style={{ color: t.accent, fontSize: 14 }} />
            <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>المحادثة</span>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 11 }} onClick={reset}>مسح</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: m.role === 'octopus' ? t.accent + '33' : t.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                    {m.role === 'octopus' ? '🐙' : '👤'}
                  </div>
                  <span style={{ fontSize: 10, color: m.role === "octopus" ? t.accent : t.textMuted, fontWeight: 500 }}>
                    {m.role === "octopus" ? "أخطبوط" : "أنت"}
                  </span>
                </div>
                <div style={{ marginRight: 23, background: m.role === 'octopus' ? t.bg : t.accent + '11', borderRadius: '0 8px 8px 8px', padding: '6px 10px', border: `0.5px solid ${t.border}` }}>
                  <p style={{ fontSize: 11, color: t.text, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.text.length > 250 ? m.text.slice(0, 250) + "..." : m.text}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Command Input */}
          <div style={{ padding: "8px 10px", borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '6px 8px' }}>
              <textarea
                style={{ flex: 1, background: 'transparent', color: t.text, border: 'none', outline: 'none', fontSize: 12, resize: 'none', fontFamily: "'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.5 }}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="اكتب أمرك..."
                rows={2}
                dir="auto"
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
          {isRunning ? 'إيقاف' : 'تشغيل'}
        </button>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>🐙 أخطبوط AI</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          {activeFile} • {currentFile?.content?.split('\n').length || 0} سطر
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>UTF-8</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }} onClick={() => setThemeOpen(p => !p)}>
          {t.name}
        </span>
      </div>
    </div>
  );
}
