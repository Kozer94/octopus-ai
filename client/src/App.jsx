import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import '@vscode/codicons/dist/codicon.css';

const BACKEND = "http://localhost:3001";
const SESSION_ID = "session_" + Date.now();

const INITIAL_FILES = [
  { name: "App.jsx", content: "// ابدأ بكتابة أمرك لأخطبوط\n" },
];

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

  const iconMap = {
    // امتدادات
    js:   { icon: 'codicon-symbol-method', color: '#f7df1e' },
    jsx:  { icon: 'codicon-symbol-method', color: '#61dafb' },
    ts:   { icon: 'codicon-symbol-method', color: '#3178c6' },
    tsx:  { icon: 'codicon-symbol-method', color: '#61dafb' },
    php:  { icon: 'codicon-symbol-class', color: '#8892be' },
    css:  { icon: 'codicon-symbol-color', color: '#42a5f5' },
    html: { icon: 'codicon-code', color: '#e44d26' },
    json: { icon: 'codicon-json', color: '#ffa657' },
    md:   { icon: 'codicon-markdown', color: '#7ee787' },
    py:   { icon: 'codicon-symbol-class', color: '#3572a5' },
    sh:   { icon: 'codicon-terminal', color: '#4caf50' },
    sql:  { icon: 'codicon-database', color: '#e38d44' },
    svg:  { icon: 'codicon-file-media', color: '#ff9800' },
    lock: { icon: 'codicon-lock', color: '#6e7681' },
    xml:  { icon: 'codicon-code', color: '#f48fb1' },
    yaml: { icon: 'codicon-settings', color: '#cb171e' },
    yml:  { icon: 'codicon-settings', color: '#cb171e' },
    txt:  { icon: 'codicon-file-text', color: '#c9d1d9' },
    env:  { icon: 'codicon-settings-gear', color: '#ecd53f' },
    toml: { icon: 'codicon-settings', color: '#ffa657' },
    ini:  { icon: 'codicon-settings', color: '#ffa657' },
    png:  { icon: 'codicon-file-media', color: '#a5d6a7' },
    jpg:  { icon: 'codicon-file-media', color: '#a5d6a7' },
    gif:  { icon: 'codicon-file-media', color: '#a5d6a7' },
  };

  const specialFiles = {
    'artisan':        { icon: 'codicon-tools', color: '#ff6b6b' },
    '.htaccess':      { icon: 'codicon-shield', color: '#c9d1d9' },
    '.gitignore':     { icon: 'codicon-source-control', color: '#f05032' },
    '.gitattributes': { icon: 'codicon-source-control', color: '#f05032' },
    '.npmrc':         { icon: 'codicon-package', color: '#cb3837' },
    '.editorconfig':  { icon: 'codicon-settings-gear', color: '#ffa657' },
    'dockerfile':     { icon: 'codicon-server', color: '#0db7ed' },
    'makefile':       { icon: 'codicon-tools', color: '#6e7681' },
    'procfile':       { icon: 'codicon-play', color: '#7ee787' },
  };

  if (specialFiles[lowerName]) return specialFiles[lowerName];
  if (lowerName.startsWith('.env')) return { icon: 'codicon-settings-gear', color: '#ecd53f' };
  if (iconMap[ext]) return iconMap[ext];
  return { icon: 'codicon-file', color: '#8b949e' };
}

function FileTreeNode({ item, level, activeFile, onFileClick }) {
  const [open, setOpen] = useState(false);

  const folderColors = {
    app: '#58a6ff', src: '#58a6ff', components: '#79c0ff',
    config: '#ffa657', database: '#ff7b72', routes: '#7ee787',
    public: '#d2a8ff', resources: '#56d364', storage: '#ffa657',
    tests: '#f778ba', bootstrap: '#ff7b72', lang: '#39d353',
    models: '#79c0ff', controllers: '#58a6ff', views: '#56d364',
    middleware: '#ffa657', providers: '#d2a8ff', mail: '#58a6ff',
    pages: '#79c0ff', hooks: '#d2a8ff', utils: '#ffa657',
    assets: '#56d364', styles: '#42a5f5', lib: '#ffa657',
  };

  const folderColor = folderColors[item.name.toLowerCase()] || '#e2a14a';

  if (item.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen(p => !p)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 8px 3px " + (8 + level * 12) + "px",
            cursor: "pointer", userSelect: "none",
            borderRadius: 4, margin: "1px 4px",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#1f2937'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ color: '#6e7681', fontSize: 9, width: 10, textAlign: 'center' }}>
            {open ? '▾' : '▸'}
          </span>
          <i
            className={`codicon ${open ? 'codicon-folder-opened' : 'codicon-folder'}`}
            style={{ color: folderColor, fontSize: 15, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, color: open ? '#e6edf3' : '#adbac7' }}>{item.name}</span>
        </div>
        {open && item.children && (
          <div style={{ borderRight: `1px solid ${folderColor}22`, marginRight: 4 }}>
            {item.children.map(child => (
              <FileTreeNode key={child.path} item={child} level={level + 1} activeFile={activeFile} onFileClick={onFileClick} />
            ))}
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
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "3px 8px 3px " + (8 + level * 12) + "px",
        cursor: "pointer", borderRadius: 4, margin: "1px 4px",
        background: isActive ? '#1f6feb22' : 'transparent',
        borderRight: isActive ? '2px solid #58a6ff' : '2px solid transparent',
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1f2937' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <i className={`codicon ${icon}`} style={{ color, fontSize: 15, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: isActive ? '#e6edf3' : '#8b949e' }}>
        {item.name}
      </span>
    </div>
  );
}

export default function App() {
  const [files, setFiles] = useState(INITIAL_FILES);
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState("App.jsx");
  const [legs, setLegs] = useState(INITIAL_LEGS);
  const [messages, setMessages] = useState([
    { role: "octopus", text: "مرحباً 🐙 أنا جاهز. أخبرني ماذا تريد أن تبني." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onFileClick(item) {
    setActiveFile(item.name);
    const already = files.find(f => f.path === item.path);
    if (already?.content) return;
    try {
      const res = await fetch(`${BACKEND}/api/files/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: item.path }),
      });
      const data = await res.json();
      if (data.success) {
        setFiles(prev => {
          const exists = prev.find(f => f.path === item.path);
          if (exists) return prev.map(f => f.path === item.path ? { ...f, content: data.content } : f);
          return [...prev, { ...item, content: data.content }];
        });
      }
    } catch { }
  }

  async function openFolder() {
    if (!window.octopus) return;
    const folderPath = await window.octopus.openFolder();
    if (!folderPath) return;
    const res = await fetch(`${BACKEND}/api/files/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath: folderPath }),
    });
    const data = await res.json();
    if (data.success) {
      setFileTree(data.items);
      setFiles([]);
    }
  }

  function activateLeg(id, task) {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, status: "working", task, progress: 0 } : l));
    const interval = setInterval(() => {
      setLegs(prev => {
        const leg = prev.find(l => l.id === id);
        if (!leg || leg.progress >= 100) { clearInterval(interval); return prev; }
        return prev.map(l => l.id === id ? { ...l, progress: l.progress + 15 } : l);
      });
    }, 200);
  }

  function completeLeg(id) {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, status: "done", progress: 100 } : l));
  }

  function resetLegs() {
    setLegs(INITIAL_LEGS);
  }

  function extractCode(text) {
    const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return match ? match[1] : null;
  }

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
      const res = await fetch(`${BACKEND}/api/octopus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: text,
          sessionId: SESSION_ID,
          activeFile: activeFile,
          activeFileContent: currentFile?.content || "",
        }),
      });
      const data = await res.json();
      completeLeg(1); completeLeg(2);
      activateLeg(3, "تعدّل الكود...");
      activateLeg(6, "تولّد الكود...");

      if (data.success) {
        setTimeout(async () => {
          completeLeg(3); completeLeg(6);
          activateLeg(8, "تدمج النتائج...");

          const code = extractCode(data.result);
          if (code) {
            setFiles(prev => {
              const exists = prev.find(f => f.name === activeFile);
              if (exists) return prev.map(f => f.name === activeFile ? { ...f, content: code } : f);
              return [...prev, { name: activeFile, content: code }];
            });

            if (currentFile?.path) {
              await fetch(`${BACKEND}/api/files/write`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath: currentFile.path, content: code }),
              });
              setMessages(prev => [...prev, {
                role: "octopus", text: `✅ تم حفظ: ${currentFile.path}`
              }]);
            }
          }

          setTimeout(() => completeLeg(8), 600);
          setMessages(prev => [...prev, { role: "octopus", text: data.result }]);
        }, 800);
      } else {
        setMessages(prev => [...prev, { role: "octopus", text: `خطأ: ${data.error}` }]);
        resetLegs();
      }
    } catch {
      setMessages(prev => [...prev, { role: "octopus", text: "⚠️ تعذّر الاتصال بالخادم." }]);
      resetLegs();
    }
    setLoading(false);
  }

  async function reset() {
    await fetch(`${BACKEND}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    });
    setMessages([{ role: "octopus", text: "تم مسح المحادثة 🐙" }]);
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const currentFile = files.find(f => f.name === activeFile);
  const legColor = (s) => s === "done" ? "#3fb950" : s === "working" ? "#f0883e" : "#6e7681";

  return (
    <div style={s.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'IBM Plex Sans Arabic', sans-serif; background: #0d1117; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
      `}</style>

      <div style={s.header}>
        <span style={{ fontSize: 20 }}>🐙</span>
        <span style={s.headerTitle}>أخطبوط</span>
        <span style={s.headerSub}>Octopus AI</span>
        <div style={{ display: "flex", gap: 6, marginRight: "auto", alignItems: "center" }}>
          <div style={s.statusDot(loading ? "working" : "idle")} />
          <span style={{ fontSize: 12, color: loading ? "#f0883e" : "#6e7681" }}>
            {loading ? "يعمل..." : "جاهز"}
          </span>
        </div>
        <button style={s.headerBtn} onClick={openFolder}>📁 فتح مجلد</button>
        <button style={s.headerBtn} onClick={reset}>🗑 مسح</button>
      </div>

      <div style={s.main}>
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <span style={s.sidebarLabel}>الملفات</span>
            <button style={s.addBtn} onClick={() => {
              const name = prompt("اسم الملف:");
              if (name) setFiles(prev => [...prev, { name, content: "" }]);
            }}>+</button>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {fileTree.length > 0
              ? fileTree.map(item => (
                <FileTreeNode
                  key={item.path}
                  item={item}
                  level={0}
                  activeFile={activeFile}
                  onFileClick={onFileClick}
                />
              ))
              : files.map(f => (
                <div
                  key={f.name}
                  style={s.fileItem(f.name === activeFile)}
                  onClick={() => setActiveFile(f.name)}
                >
                  {(() => {
                    const { icon, color } = getFileIcon(f.name);
                    return (
                      <>
                        <i className={`codicon ${icon}`} style={{ color, fontSize: 15, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: f.name === activeFile ? "#e6edf3" : "#8b949e" }}>
                          {f.name}
                        </span>
                      </>
                    );
                  })()}
                </div>
              ))
            }
          </div>
        </div>

        <div style={s.editorPane}>
          <div style={s.tabs}>
            {files.slice(0, 8).map(f => (
              <div key={f.name} style={s.tab(f.name === activeFile)} onClick={() => setActiveFile(f.name)}>
                {f.name}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              language={
                activeFile.endsWith(".jsx") || activeFile.endsWith(".js") ? "javascript" :
                activeFile.endsWith(".ts") || activeFile.endsWith(".tsx") ? "typescript" :
                activeFile.endsWith(".css") ? "css" :
                activeFile.endsWith(".html") ? "html" :
                activeFile.endsWith(".php") ? "php" :
                activeFile.endsWith(".py") ? "python" :
                activeFile.endsWith(".json") ? "json" : "plaintext"
              }
              value={currentFile?.content || ""}
              onChange={val => setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: val } : f))}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontFamily: "JetBrains Mono, Consolas, monospace",
                wordWrap: "on",
              }}
            />
          </div>
        </div>

        <div style={s.rightPanel}>
          <div style={s.legsHeader}>
            <span style={s.sidebarLabel}>الأرجل الثمانية</span>
          </div>
          <div style={s.legsList}>
            {legs.map(leg => (
              <div key={leg.id} style={s.legCard(leg.status)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={s.statusDot(leg.status)} />
                  <span style={{ fontSize: 11, color: legColor(leg.status), fontWeight: 500 }}>{leg.name}</span>
                </div>
                <p style={{ fontSize: 11, color: "#6e7681", margin: "0 0 5px" }}>{leg.task}</p>
                <div style={s.progressBar}>
                  <div style={s.progressFill(leg.progress, leg.status)} />
                </div>
              </div>
            ))}
          </div>
          <div style={s.chatArea}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: m.role === "octopus" ? "#7dd3fc" : "#8b949e" }}>
                  {m.role === "octopus" ? "🐙 أخطبوط" : "أنت"}
                </span>
                <p style={{ fontSize: 11, color: "#c9d1d9", margin: "2px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {m.text.length > 300 ? m.text.slice(0, 300) + "..." : m.text}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      <div style={s.commandBar}>
        <textarea
          style={s.commandInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder='اكتب أمرك...'
          rows={2}
          dir="auto"
        />
        <button style={s.sendBtn} onClick={send} disabled={loading}>
          {loading ? "⏳" : "إرسال ➤"}
        </button>
      </div>
    </div>
  );
}

const s = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'IBM Plex Sans Arabic', sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "#161b22", borderBottom: "0.5px solid #30363d", flexShrink: 0 },
  headerTitle: { fontSize: 15, fontWeight: 500, color: "#7dd3fc" },
  headerSub: { fontSize: 12, color: "#6e7681" },
  headerBtn: { background: "#21262d", border: "0.5px solid #30363d", borderRadius: 6, color: "#8b949e", padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  main: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 200, background: "#161b22", borderLeft: "0.5px solid #30363d", display: "flex", flexDirection: "column", flexShrink: 0 },
  sidebarHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "0.5px solid #30363d", flexShrink: 0 },
  sidebarLabel: { fontSize: 11, color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.5px" },
  addBtn: { background: "transparent", border: "none", color: "#6e7681", cursor: "pointer", fontSize: 16 },
  fileItem: (active) => ({ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", cursor: "pointer", background: active ? "#1f2937" : "transparent", borderRight: active ? "2px solid #7dd3fc" : "2px solid transparent" }),
  editorPane: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  tabs: { display: "flex", background: "#161b22", borderBottom: "0.5px solid #30363d", flexShrink: 0, overflowX: "auto" },
  tab: (active) => ({ padding: "7px 16px", fontSize: 12, cursor: "pointer", color: active ? "#e6edf3" : "#6e7681", borderBottom: active ? "2px solid #7dd3fc" : "2px solid transparent", background: active ? "#0d1117" : "transparent", whiteSpace: "nowrap" }),
  rightPanel: { width: 240, background: "#161b22", borderRight: "0.5px solid #30363d", display: "flex", flexDirection: "column", flexShrink: 0 },
  legsHeader: { padding: "8px 12px", borderBottom: "0.5px solid #30363d", flexShrink: 0 },
  legsList: { padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 280 },
  legCard: (status) => ({ background: "#0d1117", border: `0.5px solid ${status === "done" ? "#238636" : status === "working" ? "#9e6a03" : "#30363d"}`, borderRadius: 6, padding: "8px 10px", opacity: status === "idle" ? 0.5 : 1 }),
  statusDot: (status) => ({ width: 6, height: 6, borderRadius: "50%", background: status === "done" ? "#3fb950" : status === "working" ? "#f0883e" : "#6e7681", flexShrink: 0 }),
  progressBar: { background: "#21262d", borderRadius: 3, height: 3 },
  progressFill: (progress, status) => ({ background: status === "done" ? "#3fb950" : "#f0883e", width: `${progress}%`, height: "100%", borderRadius: 3, transition: "width 0.2s ease" }),
  chatArea: { flex: 1, overflowY: "auto", padding: 10, borderTop: "0.5px solid #30363d" },
  commandBar: { display: "flex", gap: 8, padding: "10px 12px", background: "#161b22", borderTop: "0.5px solid #30363d", flexShrink: 0 },
  commandInput: { flex: 1, background: "#0d1117", color: "#e6edf3", border: "0.5px solid #30363d", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "none", outline: "none", fontFamily: "'IBM Plex Sans Arabic', sans-serif" },
  sendBtn: { background: "#1f6feb", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 13, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" },
};
