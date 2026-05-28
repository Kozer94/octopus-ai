// WorkspaceView.jsx — واجهة مساحة العمل الافتراضية (Spatial Home)
// مستخرجة من EditorWorkspace.jsx — تظهر عندما لا يكون هناك ملف مفتوح

import { bidiIsolateStyle } from '../../utils/bidiText';
import { getFileIcon } from '../../utils/fileIcons';
import { getOpenFileId } from '../../utils/openFileIdentity';

const FALLBACK_NODES = [
  { name: 'workspace', icon: 'codicon-root-folder',          color: '#58a6ff', x: 50, y: 28 },
  { name: 'source',    icon: 'codicon-symbol-namespace',     color: '#3fb950', x: 25, y: 48 },
  { name: 'runtime',   icon: 'codicon-terminal',             color: '#f0883e', x: 73, y: 48 },
  { name: 'tests',     icon: 'codicon-beaker',               color: '#d29922', x: 37, y: 72 },
  { name: 'context',   icon: 'codicon-comment-discussion',   color: '#f778ba', x: 63, y: 72 },
];

const NODE_POSITIONS = [
  [50, 22], [28, 36], [72, 36],
  [22, 61], [78, 61], [50, 78],
  [36, 55], [64, 55],
];

/**
 * WorkspaceView — الصفحة الرئيسية للمساحة الفضائية مع الأخطبوط والعقد
 *
 * Props:
 *   currentDir      string
 *   displayFilePath fn(file)→string
 *   files           array
 *   onNodeClick     fn(nodeName) — الضغط على عقدة fallback
 *   projectName     string
 *   setActiveFile   fn(fileId)
 *   t               object — theme
 */
export function WorkspaceView({
  currentDir,
  displayFilePath,
  files,
  onNodeClick,
  projectName,
  setActiveFile,
  t,
}) {
  const sourceFiles = files.slice(0, 8);
  const nodes = sourceFiles.length > 0
    ? sourceFiles.map((file, index) => {
        const { icon, color } = getFileIcon(file.name);
        const [x, y] = NODE_POSITIONS[index % NODE_POSITIONS.length];
        return { name: displayFilePath(file), fileName: getOpenFileId(file), icon, color, x, y };
      })
    : FALLBACK_NODES;

  const focusFiles = files.slice(0, 5);

  return (
    <div style={{
      height: '100%',
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '1fr auto',
      background: t.bg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes octopusPulse {
          0%, 100% { transform: scale(1); opacity: 0.72; }
          50%       { transform: scale(1.05); opacity: 1; }
        }
        @keyframes orbitSweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-spatial-motion] { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(190px, 260px) minmax(280px, 1fr) minmax(180px, 240px)',
        gap: 18,
        padding: '28px 32px 18px',
        minHeight: 0,
      }}>
        {/* ─── العمود الأيسر: معلومات المشروع ─────────────────────────── */}
        <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, minWidth: 0 }}>
          <div>
            <p style={{ fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
              Spatial Workspace
            </p>
            <h1 style={{ fontSize: 26, lineHeight: 1.1, color: t.text, margin: 0, letterSpacing: 0 }}>
              {projectName || 'Octopus AI'}
            </h1>
            <p
              dir="auto"
              style={bidiIsolateStyle({
                fontSize: 12,
                color: t.textMuted,
                marginTop: 8,
                lineHeight: 1.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              })}
            >
              {currentDir || 'Open a folder to let the workspace map itself.'}
            </p>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['Open files',    files.length],
              ['Visible nodes', nodes.length],
              ['Context lanes', Math.max(1, Math.min(8, files.length || 3))],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  borderBottom: `0.5px solid ${t.border}`,
                  paddingBottom: 7,
                }}
              >
                <span style={{ fontSize: 11, color: t.textMuted }}>{label}</span>
                <span style={{ fontSize: 12, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── العمود الأوسط: خريطة الأخطبوط ──────────────────────────── */}
        <section style={{
          position: 'relative',
          minHeight: 360,
          borderTop:    `0.5px solid ${t.border}`,
          borderBottom: `0.5px solid ${t.border}`,
          overflow: 'hidden',
        }}>
          {/* خطوط الاتصال */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.62 }}
          >
            {nodes.map((node, index) => {
              const next = nodes[(index + 1) % nodes.length];
              return (
                <line
                  key={`${node.name}:${next.name}`}
                  x1={node.x} y1={node.y} x2={next.x} y2={next.y}
                  stroke={t.border}
                  strokeWidth="0.25"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <line x1="50" y1="50" x2="50" y2="22" stroke={t.accent} strokeOpacity="0.5"  strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="50" x2="28" y2="36" stroke={t.accent} strokeOpacity="0.32" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="50" x2="72" y2="36" stroke={t.accent} strokeOpacity="0.32" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* دائرة المدار */}
          <div
            data-spatial-motion
            data-respects-reduced-motion
            style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 176, height: 176,
              marginLeft: -88, marginTop: -88,
              borderRadius: '50%',
              border: `0.5px solid ${t.accent}66`,
              animation: 'orbitSweep 18s linear infinite',
              willChange: 'transform',
            }}
          />

          {/* الأخطبوط المركزي */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 112, height: 112,
            borderRadius: '50%',
            border: `1px solid ${t.border}`,
            background: t.sidebar,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 0 12px ${t.bg}99`,
          }}>
            <div
              data-spatial-motion
              data-respects-reduced-motion
              style={{ fontSize: 54, animation: 'octopusPulse 4s ease-in-out infinite', willChange: 'transform' }}
            >
              🐙
            </div>
          </div>

          {/* عقد الملفات */}
          {nodes.map(node => {
            const isClickable = !!(node.fileName || onNodeClick);
            return (
              <button
                key={node.name}
                title={node.name}
                style={{
                  position: 'absolute',
                  left: `${node.x}%`,
                  top:  `${node.y}%`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex', alignItems: 'center', gap: 7,
                  maxWidth: 168, height: 30,
                  border: `0.5px solid ${t.border}`,
                  borderRadius: 16,
                  background: t.sidebar,
                  color: t.text,
                  padding: '0 10px',
                  cursor: isClickable ? 'pointer' : 'default',
                  boxShadow: `0 0 0 4px ${t.bg}66`,
                  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                }}
                onClick={() => {
                  if (node.fileName) { setActiveFile(node.fileName); return; }
                  if (onNodeClick)   onNodeClick(node.name);
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor  = node.color;
                  e.currentTarget.style.background   = t.border;
                  if (isClickable) e.currentTarget.style.boxShadow = `0 0 0 6px ${node.color}22`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = t.border;
                  e.currentTarget.style.background  = t.sidebar;
                  e.currentTarget.style.boxShadow   = `0 0 0 4px ${t.bg}66`;
                }}
              >
                <i className={`codicon ${node.icon}`} style={{ color: node.color, fontSize: 13, flexShrink: 0 }} />
                <span dir="auto" style={bidiIsolateStyle({ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                  {node.name}
                </span>
              </button>
            );
          })}
        </section>

        {/* ─── العمود الأيمن: Focus Ring ────────────────────────────────── */}
        <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Focus Ring
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {focusFiles.length > 0
              ? focusFiles.map((file, index) => {
                  const { icon, color } = getFileIcon(file.name);
                  return (
                    <button
                      key={getOpenFileId(file)}
                      title={displayFilePath(file)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '22px 1fr auto',
                        alignItems: 'center',
                        gap: 8,
                        background: t.sidebar,
                        border: `0.5px solid ${t.border}`,
                        borderRadius: 6,
                        padding: '7px 8px',
                        cursor: 'pointer',
                        minWidth: 0,
                      }}
                      onClick={() => setActiveFile(getOpenFileId(file))}
                    >
                      <i className={`codicon ${icon}`} style={{ color, fontSize: 13 }} />
                      <span
                        dir="auto"
                        style={bidiIsolateStyle({
                          fontSize: 11, color: t.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        })}
                      >
                        {displayFilePath(file)}
                      </span>
                      <span style={{ fontSize: 10, color: t.textMuted }}>{index + 1}</span>
                    </button>
                  );
                })
              : (
                <div style={{ border: `0.5px dashed ${t.border}`, borderRadius: 6, padding: 12 }}>
                  <p style={{ fontSize: 12, color: t.text, marginBottom: 5 }}>No files in orbit</p>
                  <p style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
                    Use the left rail to open a folder, scan the project, or bring up the terminal.
                  </p>
                </div>
              )
            }
          </div>
        </section>
      </div>
    </div>
  );
}
