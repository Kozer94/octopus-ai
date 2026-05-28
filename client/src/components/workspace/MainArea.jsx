// MainArea.jsx — المنطقة الرئيسية (محرر الكود + نافذة الـ Terminal)
// مستخرج من AppShell.jsx

import { EditorWorkspace } from '../editor/EditorWorkspace';
import { TerminalPanel }   from '../terminal/TerminalPanel';

/**
 * MainArea — الغلاف الرئيسي لمحرر الكود ونافذة الـ Terminal
 *
 * يدمج EditorWorkspace (فوق) + TerminalPanel (أسفل، اختياري)
 * داخل حاوية flex-column مرنة.
 *
 * ─── Props لـ EditorWorkspace ───────────────────────────────────────────────
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
 *
 * ─── Props لـ TerminalPanel ─────────────────────────────────────────────────
 *   currentDir           string   (shared with EditorWorkspace)
 *   isRunning            boolean
 *   onClear              fn
 *   onClose              fn
 *   onCommandChange      fn
 *   onErrorDetected      fn
 *   onInterrupt          fn
 *   onResizeStart        fn
 *   onRunCommand         fn
 *   onTabChange          fn
 *   t                    object   (shared with EditorWorkspace)
 *   terminalBottomRef    ref
 *   terminalHeight       number
 *   terminalHistory      array
 *   terminalInput        string
 *   terminalOpen         boolean
 *   terminalTab          string
 *   workflowError        object | null
 */
export function MainArea({
  // EditorWorkspace
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
  input,
  installExtension,
  isExtensionInstalled,
  loadingFiles,
  loading,
  messages,
  monacoRef,
  onApproveTerminal,
  onOpenChat,
  onOpenTerminal,
  onRejectTerminal,
  onSuggestExtensionShim,
  projectName,
  selectedExtension,
  selectedModel,
  send,
  setActiveFile,
  setFiles,
  setInput,
  setSelectedModel,
  setSelectedExtension,
  t,
  terminalCommand,
  uninstallExtension,
  // TerminalPanel
  isRunning,
  onClear,
  onClose,
  onCommandChange,
  onErrorDetected,
  onInterrupt,
  onResizeStart,
  onRunCommand,
  onTabChange,
  terminalBottomRef,
  terminalBusy,
  terminalHeight,
  terminalHistory,
  terminalInput,
  terminalOpen,
  terminalTab,
  workflowError,
}) {
  return (
    <div
      className="elevation-1"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
      }}
    >
      <EditorWorkspace
        launcherOpen={launcherOpen}
        onCloseLauncher={onCloseLauncher}
        activeFile={activeFile}
        activateExtension={activateExtension}
        awaitingConfirm={awaitingConfirm}
        bottomRef={bottomRef}
        cancelPlan={cancelPlan}
        currentDir={currentDir}
        currentFile={currentFile}
        deactivateExtension={deactivateExtension}
        displayFilePath={displayFilePath}
        editorRef={editorRef}
        executeApprovedPlan={executeApprovedPlan}
        files={files}
        installExtension={installExtension}
        isExtensionInstalled={isExtensionInstalled}
        loadingFiles={loadingFiles}
        messages={messages}
        monacoRef={monacoRef}
        onOpenChat={onOpenChat}
        onOpenTerminal={onOpenTerminal}
        onSuggestExtensionShim={onSuggestExtensionShim}
        projectName={projectName}
        selectedExtension={selectedExtension}
        selectedModel={selectedModel}
        send={send}
        setActiveFile={setActiveFile}
        setFiles={setFiles}
        setSelectedExtension={setSelectedExtension}
        t={t}
        uninstallExtension={uninstallExtension}
      />

      {terminalOpen && (
        <TerminalPanel
          currentDir={currentDir}
          files={files}
          input={input}
          isRunning={isRunning || terminalBusy}
          loading={loading}
          onApproveTerminal={onApproveTerminal}
          onClear={onClear}
          onClose={onClose}
          onCommandChange={onCommandChange}
          onErrorDetected={onErrorDetected}
          onInterrupt={onInterrupt}
          onRejectTerminal={onRejectTerminal}
          onRunCommand={onRunCommand}
          onResizeStart={onResizeStart}
          onTabChange={onTabChange}
          selectedModel={selectedModel}
          send={send}
          setInput={setInput}
          setSelectedModel={setSelectedModel}
          t={t}
          terminalBottomRef={terminalBottomRef}
          terminalCommand={terminalCommand}
          terminalHeight={terminalHeight}
          terminalHistory={terminalHistory}
          terminalInput={terminalInput}
          terminalTab={terminalTab}
          workflowError={workflowError}
        />
      )}
    </div>
  );
}
