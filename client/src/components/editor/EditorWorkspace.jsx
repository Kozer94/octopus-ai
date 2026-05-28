// EditorWorkspace.jsx — منطقة المحرر الرئيسية
// شريط التبويبات + التبديل بين WorkspaceView و EditorView

import { useState } from 'react';
import { bidiIsolateStyle } from '../../utils/bidiText';
import { getFileIcon } from '../../utils/fileIcons';
import { getOpenFileId, isOpenFileActive } from '../../utils/openFileIdentity';
import { filesApi } from '../../services/apiClient';
import { ContextMenu } from '../layout/ContextMenu';
import { ChatMessages } from '../chat/ChatMessages';
import { EditorView }     from './EditorView';
import { RequirementWizard } from '../workspace/RequirementWizard';
import { WorkspaceView } from '../workspace/WorkspaceView';

function hasConversationMessages(messages = []) {
  return messages.some(message => message.id !== 'initial-octopus-ready');
}

/**
 * EditorWorkspace — يدير التبويبات ويختار العرض المناسب
 *
 * Props:
 *   activeFile           string
 *   activateExtension    fn
 *   currentDir           string
 *   currentFile          object
 *   deactivateExtension  fn
 *   displayFilePath      fn(file)→string
 *   editorRef            ref
 *   files                array
 *   installExtension     fn
 *   isExtensionInstalled fn
 *   loadingFiles         Set
 *   monacoRef            ref
 *   onActivateSidebar    fn(panel)
 *   onOpenFolder         fn
 *   onOpenRightPanel     fn
 *   onOpenTerminal       fn(mode?)
 *   onSuggestExtensionShim fn
 *   projectName          string
 *   selectedExtension    object | null
 *   setActiveFile        fn
 *   setFiles             fn
 *   setSelectedExtension fn
 *   t                    object — theme
 *   uninstallExtension   fn
 */
export function EditorWorkspace({
  launcherOpen,
  onCloseLauncher,
  activeFile,
  activateExtension,
  awaitingConfirm,
  bottomRef,
  cancelPlan,
  currentDir,
  currentFile,
  deactivateExtension,
  displayFilePath,
  editorRef,
  executeApprovedPlan,
  files,
  installExtension,
  isExtensionInstalled,
  loadingFiles,
  messages,
  monacoRef,
  onOpenChat,
  onOpenTerminal,
  onSuggestExtensionShim,
  projectName,
  selectedExtension,
  selectedModel,
  send,
  setActiveFile,
  setFiles,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  const [tabCtxMenu, setTabCtxMenu] = useState(null); // { x, y, fileId, file }

  const hiddenTabCount = Math.max(0, files.length - 8);

  // هل يجب عرض المحرر النشط بدلاً من الصفحة الرئيسية؟
  const showEditor = selectedExtension || (activeFile && currentFile);
  const showChatMessages = !showEditor && hasConversationMessages(messages);

  // ─── إغلاق تبويب واحد ────────────────────────────────────────────────────
  function closeTab(fileId) {
    const remaining = files.filter(f => getOpenFileId(f) !== fileId);
    setFiles(remaining);
    if (activeFile === fileId) {
      setActiveFile(remaining.length > 0 ? getOpenFileId(remaining[remaining.length - 1]) : '');
    }
  }

  // ─── إغلاق كل التبويبات عدا المحدد ─────────────────────────────────────
  function closeOthers(fileId) {
    const keep = files.filter(f => getOpenFileId(f) === fileId);
    setFiles(keep);
    if (!keep.find(f => getOpenFileId(f) === activeFile)) {
      setActiveFile(keep.length > 0 ? getOpenFileId(keep[0]) : '');
    }
  }

  // ─── إغلاق كل التبويبات ─────────────────────────────────────────────────
  function closeAll() {
    setFiles([]);
    setActiveFile('');
  }

  // ─── نسخ المسار ─────────────────────────────────────────────────────────
  function copyTabPath(file) {
    navigator.clipboard?.writeText(file.path || file.name).catch(() => {});
  }

  function copyRelativeTabPath(file) {
    const base = (currentDir || '').replace(/\\/g, '/');
    const full = (file.path || file.name || '').replace(/\\/g, '/');
    const rel  = full.startsWith(base + '/') ? full.slice(base.length + 1) : full;
    navigator.clipboard?.writeText(rel).catch(() => {});
  }

  function openTabInTerminal(file) {
    const filePath = (file.path || '').replace(/\\/g, '/');
    const lastSlash = filePath.lastIndexOf('/');
    const folder = lastSlash > 0 ? filePath.slice(0, lastSlash) : (currentDir || '');
    onOpenTerminal?.('folder', { cwd: folder });
  }

  // ─── بناء عناصر قائمة التبويب ───────────────────────────────────────────
  function buildTabMenuItems(fileId, file) {
    return [
      { label: 'Close',        icon: 'codicon-close',     shortcut: 'Ctrl+W', action: () => closeTab(fileId) },
      { label: 'Close Others', icon: 'codicon-close-all', action: () => closeOthers(fileId), disabled: files.length <= 1 },
      { label: 'Close All',    icon: 'codicon-close-all', action: () => closeAll() },
      { separator: true },
      { label: 'Copy Path',          icon: 'codicon-copy',              shortcut: 'Ctrl+K P',       action: () => copyTabPath(file) },
      { label: 'Copy Relative Path', icon: 'codicon-file-symlink-file', shortcut: 'Ctrl+K Shift+P', action: () => copyRelativeTabPath(file) },
      { separator: true },
      { label: 'Open Containing Folder in Terminal', icon: 'codicon-terminal',      action: () => openTabInTerminal(file) },
      { label: 'Reveal in Explorer',                 icon: 'codicon-folder-opened', action: () => filesApi.showInExplorer(file.path || file.name).catch(() => {}) },
    ];
  }

  return (
    <>
      {/* ─── شريط التبويبات ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        background: t.sidebar,
        borderBottom: `0.5px solid ${t.border}`,
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {files.map(f => {
          const { icon, color } = getFileIcon(f.name);
          const fileId        = getOpenFileId(f);
          const isActive      = isOpenFileActive(f, activeFile);
          const fullDisplay   = displayFilePath(f);

          return (
            <div
              key={fileId}
              title={fullDisplay}
              style={{
                padding:      '6px 14px',
                fontSize:     12,
                cursor:       'pointer',
                color:        isActive ? t.text : t.textMuted,
                borderBottom: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
                background:   isActive ? t.bg : 'transparent',
                whiteSpace:   'nowrap',
                display:      'flex', alignItems: 'center', gap: 6,
                paddingLeft:  10,
                maxWidth:     240,
                flex:         '0 0 auto',
                position:     'relative',
                overflow:     'hidden',
              }}
              onClick={() => setActiveFile(fileId)}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                setTabCtxMenu({ x: e.clientX, y: e.clientY, fileId, file: f });
              }}
            >
              {loadingFiles?.has(fileId) && (
                <span
                  data-respects-reduced-motion
                  style={{
                    position:     'absolute', left: 6,
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background:   t.accent,
                    animation:    'spin 1s linear infinite',
                  }}
                >
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </span>
              )}
              <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />
              <span dir="auto" style={bidiIsolateStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                {fullDisplay}
              </span>
              {/* زر إغلاق التبويب */}
              <span
                style={{
                  fontSize:     14,
                  color:        t.textMuted,
                  marginRight:  2,
                  lineHeight:   1,
                  padding:      '0 2px',
                  borderRadius: 3,
                  opacity:      isActive ? 1 : 0,
                }}
                onClick={e => {
                  e.stopPropagation();
                  closeTab(fileId);
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.border; e.currentTarget.style.opacity = 1; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = isActive ? '1' : '0'; }}
              >
                ×
              </span>
            </div>
          );
        })}

        {hiddenTabCount > 0 && (
          <span
            title={`${hiddenTabCount} files are accessible by horizontal scrolling`}
            style={{
              flex:         '0 0 auto',
              padding:      '6px 10px',
              fontSize:     11,
              color:        t.textMuted,
              borderBottom: '2px solid transparent',
            }}
          >
            ... +{hiddenTabCount} more
          </span>
        )}
      </div>

      {/* ─── مسار الملف الحالي (breadcrumb) ──────────────────────────────── */}
      {currentFile && (
        <div style={{
          padding:      '3px 12px',
          background:   t.bg,
          borderBottom: `0.5px solid ${t.border}`,
          fontSize:     11,
          color:        t.textMuted,
          display:      'flex', alignItems: 'center', gap: 4,
        }}>
          <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.textMuted }} />
          <span dir="auto" style={bidiIsolateStyle({ color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
            {displayFilePath(currentFile)}
          </span>
        </div>
      )}

      {/* ─── منطقة المحتوى: EditorView / ChatMessages / WorkspaceView / Launcher ─── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {showEditor
          ? (
            <EditorView
              activeFile={activeFile}
              activateExtension={activateExtension}
              currentFile={currentFile}
              deactivateExtension={deactivateExtension}
              displayFilePath={displayFilePath}
              editorRef={editorRef}
              installExtension={installExtension}
              isExtensionInstalled={isExtensionInstalled}
              monacoRef={monacoRef}
              onSuggestExtensionShim={onSuggestExtensionShim}
              selectedExtension={selectedExtension}
              setFiles={setFiles}
              setSelectedExtension={setSelectedExtension}
              t={t}
              uninstallExtension={uninstallExtension}
            />
          )
          : launcherOpen
            ? (
              <RequirementWizard
                onOpenChat={() => { onCloseLauncher?.(); onOpenChat?.(); }}
                projectName={projectName}
                selectedModel={selectedModel}
                send={send}
                t={t}
              />
            )
          : showChatMessages
            ? (
              <ChatMessages
                awaitingConfirm={awaitingConfirm}
                bottomRef={bottomRef}
                cancelPlan={cancelPlan}
                centerMode
                currentDir={currentDir}
                executeApprovedPlan={executeApprovedPlan}
                messages={messages}
                t={t}
              />
            )
          : (
            <WorkspaceView
              currentDir={currentDir}
              displayFilePath={displayFilePath}
              files={files}
              projectName={projectName}
              setActiveFile={setActiveFile}
              t={t}
            />
          )
        }
      </div>

      {/* ─── قائمة سياق التبويبات ─────────────────────────────────────────── */}
      {tabCtxMenu && (
        <ContextMenu
          items={buildTabMenuItems(tabCtxMenu.fileId, tabCtxMenu.file)}
          onClose={() => setTabCtxMenu(null)}
          t={t}
          x={tabCtxMenu.x}
          y={tabCtxMenu.y}
        />
      )}
    </>
  );
}
