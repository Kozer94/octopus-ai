import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";

const BACKEND = "http://localhost:3001";
const SESSION_ID = "session_" + Date.now();

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

const INITIAL_FILES = [
  { name: "App.jsx", content: "// ابدأ بكتابة أمرك لأخطبوط\n// مثال: أضف نظام تسجيل دخول\n" },
];

export default function App() {
  const [files, setFiles] = useState(INITIAL_FILES);
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

  function activateLeg(id, task) {
    setLegs(prev => prev.map(l =>
      l.id === id ? { ...l, status: "working", task, progress: 0 } : l
    ));
    const interval = setInterval(() => {
      setLegs(prev => {
        const leg = prev.find(l => l.id === id);
        if (!leg || leg.progress >= 100) { clearInterval(interval); return prev; }
        return prev.map(l => l.id === id ? { ...l, progress: l.progress + 10 } : l);
      });
    }, 200);
  }

  function completeLeg(id) {
    setLegs(prev => prev.map(l =>
      l.id === id ? { ...l, status: "done", progress: 100 } : l
    ));
  }

  function resetLegs() {
    setLegs(INITIAL_LEGS);
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

    try {
      const res = await fetch(`${BACKEND}/api/octopus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text, sessionId: SESSION_ID }),
      });
      const data = await res.json();

      completeLeg(1);
      completeLeg(2);
      activateLeg(3, "تعدّل الكود...");
      activateLeg(6, "تولّد الكود...");

      if (data.success) {
        setTimeout(() => {
          completeLeg(3);
          completeLeg(6);
          activateLeg(8, "تدمج النتائج...");

          const code = extractCode(data.result);
          if (code) {
            const fileName = extractFileName(text) || activeFile;
            setFiles(prev => {
              const exists = prev.find(f => f.name === fileName);
              if (exists) return prev.map(f => f.name === fileName ? { ...f, content: code } : f);
              return [...prev, { name: fileName, content: code }];
            });
            setActiveFile(fileName);
          }

          setTimeout(() => completeLeg(8), 800);
          setMessages(prev => [...prev, { role: "octopus", text: data.result }]);
        }, 1000);
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

  function extractCode(text) {
    const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return match ? match[1] : null;
  }

  function extractFileName(text) {
    const match = text.match(/(\w+\.\w+)/);
    return match ? match[1] : null;
  }

  async function openFolder() {
    if (window.octopus) {
      const folderPath = await window.octopus.openFolder();
      if (folderPath) {
        const res = await fetch(`${BACKEND}/api/files/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: folderPath }),
        });
        const data = await res.json();
        if (data.success) {
          const newFiles = data.items
            .filter(i => i.type === 'file')
            .map(i => ({ name: i.name, content: '', path: i.path }));
          setFiles(newFiles);
          if (newFiles.length > 0) setActiveFile(newFiles[0].name);
        }
      }
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const currentFile = files.find(f => f.name === activeFile);

  const legColor = (status) => {
    if (status === "done") return "#3fb950";
    if (status === "working") return "#f0883e";
    return "#6e7681";
  };

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

      {/* Header */}
      <div style={s.header}>
        <span style={{fontSize:20}}>🐙</span>
        <span style={s.headerTitle}>أخطبوط</span>
        <span style={s.headerSub}>Octopus AI</span>
        <div style={{display:"flex", gap:6, marginRight:"auto"}}>
          <div style={s.statusDot(loading ? "working" : "idle")} />
          <span style={{fontSize:12, color: loading ? "#f0883e" : "#6e7681"}}>
            {loading ? "يعمل..." : "جاهز"}
          </span>
        </div>
        <button style={s.headerBtn} onClick={openFolder}>
          <span>📁</span> فتح مجلد
        </button>
        <button style={s.headerBtn}>⚙️</button>
      </div>

      {/* Main */}
      <div style={s.main}>

        {/* Sidebar - Files */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <span style={s.sidebarLabel}>الملفات</span>
            <button
              style={s.addBtn}
              onClick={() => {
                const name = prompt("اسم الملف:");
                if (name) setFiles(prev => [...prev, { name, content: "" }]);
              }}
            >+</button>
          </div>
          {files.map(f => (
            <div
              key={f.name}
              style={s.fileItem(f.name === activeFile)}
              onClick={async () => {
                setActiveFile(f.name);
                if (f.path && !f.content) {
                  const res = await fetch(`${BACKEND}/api/files/read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: f.path }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setFiles(prev => prev.map(file =>
                      file.name === f.name ? { ...file, content: data.content } : file
                    ));
                  }
                }
              }}
            >
              <span style={{fontSize:12}}>📄</span>
              <span style={{fontSize:12, color: f.name === activeFile ? "#e6edf3" : "#8b949e"}}>
                {f.name}
              </span>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div style={s.editorPane}>
          <div style={s.tabs}>
            {files.map(f => (
              <div
                key={f.name}
                style={s.tab(f.name === activeFile)}
                onClick={() => setActiveFile(f.name)}
              >
                {f.name}
              </div>
            ))}
          </div>
          <div style={{flex:1}}>
            <Editor
              height="100%"
              language={activeFile.endsWith(".jsx") || activeFile.endsWith(".js") ? "javascript" :
                activeFile.endsWith(".css") ? "css" :
                activeFile.endsWith(".html") ? "html" : "plaintext"}
              value={currentFile?.content || ""}
              onChange={val => setFiles(prev =>
                prev.map(f => f.name === activeFile ? { ...f, content: val } : f)
              )}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontFamily: "JetBrains Mono, Consolas, monospace",
                lineNumbers: "on",
                wordWrap: "on",
              }}
            />
          </div>
        </div>

        {/* Right Panel */}
        <div style={s.rightPanel}>
          {/* Legs */}
          <div style={s.legsHeader}>
            <span style={s.sidebarLabel}>الأرجل الثمانية</span>
          </div>
          <div style={s.legsList}>
            {legs.map(leg => (
              <div key={leg.id} style={s.legCard(leg.status)}>
                <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:4}}>
                  <div style={s.statusDot(leg.status)} />
                  <span style={{fontSize:11, color: legColor(leg.status), fontWeight:500}}>
                    {leg.name}
                  </span>
                </div>
                <p style={{fontSize:11, color:"#6e7681", margin:"0 0 6px"}}>{leg.task}</p>
                <div style={s.progressBar}>
                  <div style={s.progressFill(leg.progress, leg.status)} />
                </div>
              </div>
            ))}
          </div>

          {/* Chat */}
          <div style={s.chatArea}>
            {messages.map((m, i) => (
              <div key={i} style={{marginBottom:8}}>
                <span style={{fontSize:10, color: m.role === "octopus" ? "#7dd3fc" : "#8b949e"}}>
                  {m.role === "octopus" ? "🐙 أخطبوط" : "أنت"}
                </span>
                <p style={{fontSize:11, color:"#c9d1d9", margin:"2px 0 0", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word"}}>
                  {m.text.length > 200 ? m.text.slice(0, 200) + "..." : m.text}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Command Bar */}
      <div style={s.commandBar}>
        <textarea
          style={s.commandInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder='اكتب أمرك... مثال: "أضف نظام تسجيل دخول بالبريد الإلكتروني"'
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
  root: {
    display: "flex", flexDirection: "column", height: "100vh",
    background: "#0d1117", color: "#e6edf3",
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 16px", background: "#161b22",
    borderBottom: "0.5px solid #30363d", flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 500, color: "#7dd3fc" },
  headerSub: { fontSize: 12, color: "#6e7681" },
  headerBtn: {
    background: "#21262d", border: "0.5px solid #30363d",
    borderRadius: 6, color: "#8b949e", padding: "4px 10px",
    fontSize: 12, cursor: "pointer",
  },
  main: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: {
    width: 180, background: "#161b22",
    borderLeft: "0.5px solid #30363d", display: "flex",
    flexDirection: "column", flexShrink: 0, overflow: "auto",
  },
  sidebarHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 12px", borderBottom: "0.5px solid #30363d",
  },
  sidebarLabel: { fontSize: 11, color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.5px" },
  addBtn: {
    background: "transparent", border: "none", color: "#6e7681",
    cursor: "pointer", fontSize: 16, lineHeight: 1,
  },
  fileItem: (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px", cursor: "pointer",
    background: active ? "#1f2937" : "transparent",
    borderRight: active ? "2px solid #7dd3fc" : "2px solid transparent",
  }),
  editorPane: {
    flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
  },
  tabs: {
    display: "flex", background: "#161b22",
    borderBottom: "0.5px solid #30363d", flexShrink: 0,
  },
  tab: (active) => ({
    padding: "7px 16px", fontSize: 12, cursor: "pointer",
    color: active ? "#e6edf3" : "#6e7681",
    borderBottom: active ? "2px solid #7dd3fc" : "2px solid transparent",
    background: active ? "#0d1117" : "transparent",
  }),
  rightPanel: {
    width: 240, background: "#161b22",
    borderRight: "0.5px solid #30363d", display: "flex",
    flexDirection: "column", flexShrink: 0,
  },
  legsHeader: {
    padding: "8px 12px", borderBottom: "0.5px solid #30363d", flexShrink: 0,
  },
  legsList: { padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 300 },
  legCard: (status) => ({
    background: "#0d1117", border: `0.5px solid ${status === "done" ? "#238636" : status === "working" ? "#9e6a03" : "#30363d"}`,
    borderRadius: 6, padding: "8px 10px",
    opacity: status === "idle" ? 0.5 : 1,
  }),
  statusDot: (status) => ({
    width: 6, height: 6, borderRadius: "50%",
    background: status === "done" ? "#3fb950" : status === "working" ? "#f0883e" : "#6e7681",
    flexShrink: 0,
  }),
  progressBar: { background: "#21262d", borderRadius: 3, height: 3 },
  progressFill: (progress, status) => ({
    background: status === "done" ? "#3fb950" : "#f0883e",
    width: `${progress}%`, height: "100%", borderRadius: 3,
    transition: "width 0.2s ease",
  }),
  chatArea: {
    flex: 1, overflowY: "auto", padding: 10,
    borderTop: "0.5px solid #30363d",
  },
  commandBar: {
    display: "flex", gap: 8, padding: "10px 12px",
    background: "#161b22", borderTop: "0.5px solid #30363d", flexShrink: 0,
  },
  commandInput: {
    flex: 1, background: "#0d1117", color: "#e6edf3",
    border: "0.5px solid #30363d", borderRadius: 8,
    padding: "8px 12px", fontSize: 13, resize: "none",
    outline: "none", fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  },
  sendBtn: {
    background: "#1f6feb", color: "#fff", border: "none",
    borderRadius: 8, padding: "0 16px", fontSize: 13,
    cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
  },
};
