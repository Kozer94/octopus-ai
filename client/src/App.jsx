import { useEffect, useState, useRef } from "react";
import '@vscode/codicons/dist/codicon.css';
import { AppShell } from './components/layout/AppShell';
import { BACKEND, createSessionId, THEMES } from './config/uiConfig';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useDiffApproval } from './hooks/useDiffApproval';
import { useExtensionsManager } from './hooks/useExtensionsManager';
import { useGitStatus } from './hooks/useGitStatus';
import { useLegProgress } from './hooks/useLegProgress';
import { useOctopusWorkflow } from './hooks/useOctopusWorkflow';
import { useProjectScan } from './hooks/useProjectScan';
import { useProjectWorkspace } from './hooks/useProjectWorkspace';
import { useResizableLayout } from './hooks/useResizableLayout';
import { useRuntimeInspector } from './hooks/useRuntimeInspector';
import { useTerminalApprovals } from './hooks/useTerminalApprovals';
import { useTerminalRunner } from './hooks/useTerminalRunner';
import { useTitleMenuItems } from './hooks/useTitleMenuItems';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch';
import './styles/animations.css';
import './styles/depth.css';
import './styles/glassmorphism.css';
import { filesApi, shimApi } from './services/apiClient';
import { getDefaultModelId } from './services/ModelRegistry';
import { INITIAL_CHAT_MESSAGES, octopusMessage } from './utils/chatMessages';
import { useAutoSave } from './hooks/useAutoSave';
import { useLayoutAuditor } from './auditor/useLayoutAuditor';

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

function stripAnsi(value = '') {
  return String(value).replace(ANSI_ESCAPE_PATTERN, '').trim();
}

function getRuntimeErrorSignal(runtimeStatus = {}) {
  if (runtimeStatus.error) return stripAnsi(runtimeStatus.error);
  const logs = Array.isArray(runtimeStatus.logs) ? runtimeStatus.logs : [];
  const failureLog = [...logs].reverse().find(log => {
    const message = stripAnsi(log?.message);
    return log?.level === 'err'
      || /activationFailed|ACTIVATE FAILED|TypeError|ReferenceError|is not a function|Cannot /.test(message);
  });
  return failureLog ? stripAnsi(failureLog.message) : 'Unknown VS Code API compatibility failure';
}

export default function App() {
  const { activateLeg, completeLeg, legs, resetLegs, setLegs } = useLegProgress();
  const [messages, setMessages] = useState(INITIAL_CHAT_MESSAGES);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(getDefaultModelId);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = globalThis.localStorage?.getItem('octopus-theme');
    if (stored && THEMES[stored]) return stored;
    const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    return prefersDark === false ? 'light' : 'dark';
  });
  const [themeOpen, setThemeOpen] = useState(false);

  // حفظ الثيم + متابعة إعدادات النظام
  useEffect(() => {
    globalThis.localStorage?.setItem('octopus-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return;
    const handler = (e) => {
      const stored = globalThis.localStorage?.getItem('octopus-theme');
      if (!stored) setTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);
  const {
    activeActivity,
    resetLayout: resetPanelsLayout,
    rightPanelOpen,
    rightPanelTab,
    rightPanelWidth,
    setActiveActivity,
    setRightPanelOpen,
    setRightPanelTab,
    setSidebarOpen,
    sidebarOpen,
    sidebarWidth,
    startRightPanelResize,
    startSidebarResize,
    startTerminalResize,
    terminalHeight,
  } = useResizableLayout();
  const [pendingPlan, setPendingPlan] = useState(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // 'file' | 'edit' | 'view' | 'run' | 'help' | null
  const [pendingDiffFiles, setPendingDiffFiles] = useState([]);
  const [pendingTerminalCommands, setPendingTerminalCommands] = useState([]);
  const [workflowError, setWorkflowError] = useState(null);
  const [sessionId] = useState(() => createSessionId());
  const [repairingShimFor, setRepairingShimFor] = useState('');
  const lastExtensionRuntimeFailureRef = useRef('');
  function appendOctopusMessage(text) {
    setMessages(prev => [...prev, octopusMessage(text)]);
  }

  function suggestExtensionShim({ extensionId, status }) {
    const error = getRuntimeErrorSignal(status?.runtimeStatus);
    const signature = `${extensionId}:${error}`;
    if (lastExtensionRuntimeFailureRef.current === signature) return;
    lastExtensionRuntimeFailureRef.current = signature;
    const text = [
      `🧩 Runtime failed while activating \`${extensionId}\`.`,
      '',
      'I detected this as a VS Code API compatibility gap in the experimental shim host.',
      `Missing/error signal: ${error}`,
      '',
      'I can draft the next `vscodeShim` polyfill for this extension and add a focused regression test.',
    ].join('\n');
    setMessages(prev => [...prev, octopusMessage(text, {
      extensionRuntimeFailure: { extensionId, errorSignal: error },
    })]);
    setTerminalOpen(true);
    setTerminalTab('chat');
  }

  async function repairExtensionShim({ extensionId, errorSignal }) {
    if (!extensionId || repairingShimFor) return;
    setRepairingShimFor(extensionId);
    try {
      const result = await shimApi.repair({ extensionId, errorSignal });
      const status = result.applied ? 'Applied' : 'Already present';
      setMessages(prev => [...prev, octopusMessage([
        `🛠️ ${status}: ${result.polyfillId}`,
        result.message,
        `Changed: ${(result.changedFiles || []).join(', ') || 'no files changed'}`,
        '',
        'Try Activate shim again to verify the next runtime gap.',
      ].join('\n'))]);
    } catch (error) {
      setMessages(prev => [...prev, octopusMessage(`⚠️ Shim repair was not applied: ${error.message}`)]);
    } finally {
      setRepairingShimFor('');
    }
  }

  const activateSidebarPanel = (activityId) => {
    setActiveActivity(activityId);
    setSidebarOpen(true);
  };

  function handleProjectChange() {
    clearGitFiles();
  }

  function handleFileReadError(entry) {
    setTerminalHistory(prev => [...prev, entry]);
  }

  const {
    activeFile,
    closeActiveFile,
    closeAllFiles,
    copyCurrentFilePath,
    createScratchFile,
    currentDir,
    currentFile,
    displayFilePath,
    fileTree,
    files,
    loadingFiles,
    openFolder,
    openProjectFileByName,
    projects,
    projectsOpen,
    projectName,
    refreshFileTree,
    saveAllOpenFiles,
    saveCurrentFile,
    setActiveFile,
    setFileTree,
    setFiles,
    setProjectsOpen,
    switchProject,
    onFileClick,
  } = useProjectWorkspace({
    activateSidebarPanel,
    addOctopusMessage: appendOctopusMessage,
    onFileReadError: handleFileReadError,
    onProjectChange: handleProjectChange,
  });

  useAutoSave({
    currentDir,
    files,
    setFiles,
    activeFile,
    setActiveFile,
    addOctopusMessage: appendOctopusMessage,
  });
  const {
    clearSearch,
    doSearch,
    searchQuery,
    searchResults,
    searching,
    setSearchQuery,
  } = useWorkspaceSearch({ currentDir });
  const {
    extSearchQuery,
    extSearchResults,
    extSearching,
    activateExtension,
    deactivateExtension,
    installExtension,
    installLocalVsix,
    installedExtensions,
    isExtensionInstalled,
    searchExtensions,
    selectedExtension,
    setExtSearchQuery,
    setSelectedExtension,
    uninstallExtension,
  } = useExtensionsManager({ onActivationFailed: suggestExtensionShim });
  const {
    refreshRuntimeInspector,
    runtimeControlPlane,
    runtimeGraph,
    runtimeMetrics,
    runtimeReplay,
    runtimeTasks,
    runtimeTrace,
    runtimeTree,
    runtimeWorkers,
    selectedRuntimeTask,
    selectedTraceId,
    setSelectedRuntimeTask,
    setTimelineEvents,
    timelineEvents,
    traceSpans,
  } = useRuntimeInspector({ rightPanelTab });
  const {
    clearTerminal,
    interruptTerminalCommand,
    isRunning,
    restartProject,
    runCommand,
    runProcess,
    setTerminalHistory,
    setTerminalInput,
    setTerminalOpen,
    setTerminalTab,
    terminalBusy,
    terminalHistory,
    terminalInput,
    terminalOpen,
    terminalTab,
    toggleRun,
  } = useTerminalRunner({ currentDir, fileTree });
  const {
    clearGitFiles,
    commitMsg,
    doCommit,
    gitFiles,
    gitLoading,
    loadGitStatus,
    setCommitMsg,
  } = useGitStatus({ currentDir, setTerminalHistory, setTerminalOpen });
  const bottomRef = useRef(null);
  const terminalBottomRef = useRef(null);
  const searchInputRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const diffDecorationsRef = useRef([]);
  const [sessionStartedAt] = useState(() => Date.now());
  const t = THEMES[theme];
  const { isCommandPaletteOpen, closeCommandPalette } = useCommandPalette();

  const onCommandPaletteAction = (item) => {
    if (!item) return;
    if (item.id === 'ai.ask') { setTerminalOpen(true); setTerminalTab('chat'); }
    else if (item.id === 'ai.explain') { setTerminalOpen(true); setTerminalTab('chat'); }
    else if (item.id === 'ai.refactor') { setTerminalOpen(true); setTerminalTab('chat'); }
    else if (item.id === 'ai.fix') { setTerminalOpen(true); setTerminalTab('chat'); }
    else if (item.id === 'ai.generate') { setTerminalOpen(true); setTerminalTab('chat'); }
    else if (item.id === 'file.open') { openFolder(); }
    else if (item.id === 'file.save') { saveCurrentFile(); }
    else if (item.id === 'file.saveAll') { saveAllOpenFiles(); }
    else if (item.id === 'file.new') { createScratchFile(); }
    else if (item.id === 'view.explorer') { setActiveActivity('explorer'); setSidebarOpen(true); }
    else if (item.id === 'view.search') { setActiveActivity('search'); setSidebarOpen(true); }
    else if (item.id === 'view.git') { setActiveActivity('git'); setSidebarOpen(true); }
    else if (item.id === 'view.terminal') { setTerminalOpen(true); setTerminalTab('terminal'); }
    else if (item.id === 'view.runtime') { setRightPanelOpen(true); setRightPanelTab('runtime'); }
    else if (item.id === 'run.start') { if (!isRunning) toggleRun(); }
    else if (item.id === 'run.stop') { if (isRunning) toggleRun(); }
    else if (item.id === 'run.restart') { restartProject && restartProject(); }
    else if (item.isRecent && item.fileName) { openProjectFileByName(item.fileName); }
  };

  const auditor = useLayoutAuditor({
    sidebarWidth,
    rightPanelWidth,
    sidebarOpen,
    rightPanelOpen,
    openFileCount: files.length,
    visibleTabCount: files.length,
    treeDepth: 0,
    sessionStartedAt,
    configSource: BACKEND,
    configUsesEnv: true,
    isAIError: !!workflowError,
    isTerminalConnected: terminalOpen,
    legsStuckWorking: legs.some(l => l.status === 'working') && !loading,
    legsLastUpdate: null,
    loading,
    hasErrorBoundary: true,
    terminalReconnectSupported: true,
    autoSaveEnabled: true,
    monacoCleanupExists: true,
    systemThemeSync: true,
    searchDebounceMs: 300,
  });

  useAutoScroll(bottomRef, messages);
  useAutoScroll(terminalBottomRef, terminalHistory);

  useAppShortcuts({ searchInputRef, setSidebarOpen, setTerminalOpen });

  // فتح تبويب Chat تلقائياً عند وصول أمر terminal يحتاج موافقة
  useEffect(() => {
    if (pendingTerminalCommands[0]) {
      setTerminalOpen(true);
      setTerminalTab('chat');
    }
  }, [pendingTerminalCommands, setTerminalOpen, setTerminalTab]);

  const { approveTerminalCommand, queueTerminalCommand, rejectTerminalCommand } = useTerminalApprovals({
    pendingTerminalCommands,
    runCommand,
    setPendingTerminalCommands,
    setTerminalHistory,
    setTerminalOpen,
    setTerminalTab,
  });
  const {
    acceptDiffFile,
    currentDiffFile,
    currentDiffLines,
    rejectDiffFile,
  } = useDiffApproval({
    currentDir,
    diffDecorationsRef,
    editorRef,
    monacoRef,
    pendingDiffFiles,
    refreshFileTree,
    setActiveFile,
    setFiles,
    setPendingDiffFiles,
  });

  const { cancelPlan, executeApprovedPlan, reset, send } = useOctopusWorkflow({
    activeFile,
    activateLeg,
    awaitingConfirm,
    completeLeg,
    currentDir,
    files,
    filesApi,
    input,
    legs,
    loading,
    pendingPlan,
    projectDir: currentDir,
    queueTerminalCommand,
    resetLegs,
    sessionId,
    setActiveFile,
    setAwaitingConfirm,
    setFileTree,
    setFiles,
    setInput,
    setLegs,
    setLoading,
    setMessages,
    setPendingDiffFiles,
    setPendingPlan,
    setWorkflowError,
  });

  const { handleScan } = useProjectScan({ currentDir, refreshFileTree, setMessages });

  // تێرمینال زیرەک — هەڵە دۆزیەوە → AI خۆکار چارەسەری پێشنیار دەکات
  function handleTerminalError(errorText) {
    setMessages(prev => [...prev, octopusMessage('🔍 Terminal error detected — asking AI for help...')]);
    setTerminalOpen(true);
    setTerminalTab('chat');
    send(`[Mode: Fix]\nTerminal error detected:\n\`\`\`\n${errorText}\n\`\`\`\nPlease analyze this error and suggest a fix.`);
  }

  const activateRightPanel = (tab) => {
    setRightPanelTab(tab);
    setRightPanelOpen(true);
  };
  const openTerminalTab = (tab = 'terminal') => {
    setTerminalOpen(true);
    setTerminalTab(tab);
  };
  const resetLayout = () => {
    setTerminalOpen(false);
    resetPanelsLayout();
  };

  const currentTerminalCommand = pendingTerminalCommands[0];
  const titleMenuItems = useTitleMenuItems({
    activeFile,
    activateRightPanel,
    activateSidebarPanel,
    clearSearch,
    closeActiveFile,
    closeAllFiles,
    commitMsg,
    copyCurrentFilePath,
    createScratchFile,
    currentDir,
    currentFile,
    doCommit,
    files,
    gitFiles,
    installedExtensions,
    isRunning,
    loadGitStatus,
    openFolder,
    openProjectFileByName,
    openTerminalTab,
    refreshFileTree,
    reset,
    resetLayout,
    restartProject,
    rightPanelOpen,
    saveAllOpenFiles,
    saveCurrentFile,
    searchInputRef,
    searchQuery,
    searchResults,
    setMessages,
    setRightPanelOpen,
    setSidebarOpen,
    setTerminalOpen,
    setTheme,
    sidebarOpen,
    terminalOpen,
    theme,
    toggleRun,
  });

  return (
    <AppShell
      acceptDiffFile={acceptDiffFile}
      activeActivity={activeActivity}
      activeFile={activeFile}
      awaitingConfirm={awaitingConfirm}
      bottomRef={bottomRef}
      cancelPlan={cancelPlan}
      clearTerminal={clearTerminal}
      commitMsg={commitMsg}
      createScratchFile={createScratchFile}
      currentDiffFile={currentDiffFile}
      currentDiffLines={currentDiffLines}
      currentDir={currentDir}
      currentFile={currentFile}
      currentTerminalCommand={currentTerminalCommand}
      displayFilePath={displayFilePath}
      doCommit={doCommit}
      doSearch={doSearch}
      editorRef={editorRef}
      executeApprovedPlan={executeApprovedPlan}
      extSearchQuery={extSearchQuery}
      extSearchResults={extSearchResults}
      extSearching={extSearching}
      fileTree={fileTree}
      files={files}
      gitFiles={gitFiles}
      gitLoading={gitLoading}
      handleScan={handleScan}
      input={input}
      activateExtension={activateExtension}
      deactivateExtension={deactivateExtension}
      onSuggestExtensionShim={(extension) => suggestExtensionShim({
        extensionId: extension.id || extension.name,
        status: { runtimeStatus: extension.runtimeStatus },
      })}
      installExtension={installExtension}
      installLocalVsix={installLocalVsix}
      interruptTerminalCommand={interruptTerminalCommand}
      isExtensionInstalled={isExtensionInstalled}
      isRunning={isRunning}
      legs={legs}
      loadGitStatus={loadGitStatus}
      loading={loading}
      loadingFiles={loadingFiles}
      menuItems={titleMenuItems}
      menuOpen={menuOpen}
      messages={messages}
      onRepairExtensionShim={repairExtensionShim}
      onTerminalError={handleTerminalError}
      monacoRef={monacoRef}
      onFileClick={onFileClick}
      openFolder={openFolder}
      projectName={projectName}
      projects={projects}
      projectsOpen={projectsOpen}
      refreshRuntimeInspector={refreshRuntimeInspector}
      rejectDiffFile={rejectDiffFile}
      rejectTerminalCommand={rejectTerminalCommand}
      approveTerminalCommand={approveTerminalCommand}
      reset={reset}
      rightPanelOpen={rightPanelOpen}
      rightPanelTab={rightPanelTab}
      rightPanelWidth={rightPanelWidth}
      runCommand={runCommand}
      runProcess={runProcess}
      runtimeControlPlane={runtimeControlPlane}
      runtimeGraph={runtimeGraph}
      runtimeMetrics={runtimeMetrics}
      runtimeReplay={runtimeReplay}
      runtimeTasks={runtimeTasks}
      runtimeTrace={runtimeTrace}
      runtimeTree={runtimeTree}
      runtimeWorkers={runtimeWorkers}
      selectedTraceId={selectedTraceId}
      searchExtensions={searchExtensions}
      searchInputRef={searchInputRef}
      searchQuery={searchQuery}
      searchResults={searchResults}
      searching={searching}
      selectedExtension={selectedExtension}
      selectedModel={selectedModel}
      selectedRuntimeTask={selectedRuntimeTask}
      send={send}
      setActiveActivity={setActiveActivity}
      setActiveFile={setActiveFile}
      setCommitMsg={setCommitMsg}
      setExtSearchQuery={setExtSearchQuery}
      setFiles={setFiles}
      setInput={setInput}
      setMenuOpen={setMenuOpen}
      setProjectsOpen={setProjectsOpen}
      setRightPanelOpen={setRightPanelOpen}
      setRightPanelTab={setRightPanelTab}
      setSearchQuery={setSearchQuery}
      setSelectedExtension={setSelectedExtension}
      setSelectedModel={setSelectedModel}
      setSelectedRuntimeTask={setSelectedRuntimeTask}
      setSidebarOpen={setSidebarOpen}
      setTerminalInput={setTerminalInput}
      setTerminalOpen={setTerminalOpen}
      setTerminalTab={setTerminalTab}
      setTheme={setTheme}
      setThemeOpen={setThemeOpen}
      setTimelineEvents={setTimelineEvents}
      sidebarOpen={sidebarOpen}
      sidebarWidth={sidebarWidth}
      startRightPanelResize={startRightPanelResize}
      startSidebarResize={startSidebarResize}
      startTerminalResize={startTerminalResize}
      switchProject={switchProject}
      t={t}
      terminalBottomRef={terminalBottomRef}
      terminalBusy={terminalBusy}
      terminalHeight={terminalHeight}
      terminalHistory={terminalHistory}
      terminalInput={terminalInput}
      terminalOpen={terminalOpen}
      terminalTab={terminalTab}
      theme={theme}
      themeOpen={themeOpen}
      timelineEvents={timelineEvents}
      traceSpans={traceSpans}
      toggleRun={toggleRun}
      uninstallExtension={uninstallExtension}
      workflowError={workflowError}
      onWorkflowErrorDismiss={() => setWorkflowError(null)}
      repairingShimFor={repairingShimFor}
      auditResults={auditor.results}
      onAuditRun={auditor.run}
      isCommandPaletteOpen={isCommandPaletteOpen}
      closeCommandPalette={closeCommandPalette}
      onCommandPaletteAction={onCommandPaletteAction}
    />
  );
}
