// AppShell.jsx — الغلاف الرئيسي للتطبيق
// يستخدم SidePanel و MainArea بعد إعادة الهيكلة

import { CommandPalette }      from './CommandPalette';
import { DiffApprovalModal }   from '../editor/DiffApprovalModal';
import { ActivityBar }         from './ActivityBar';
import { MainArea }            from '../workspace/MainArea';
import { OctopusWorking }      from './OctopusWorking';
import { RightPanel }          from './RightPanel';
import { RuntimeStatusBar }    from './RuntimePulse';
import { SidePanel }           from '../explorer/SidePanel';
import { StatusBar }           from './StatusBar';
import { TitleBar }            from './TitleBar';

export function AppShell(props) {
  const {
    acceptDiffFile,
    activeActivity,
    activeFile,
    awaitingConfirm,
    bottomRef,
    cancelPlan,
    clearTerminal,
    commitMsg,
    createScratchFile,
    currentDiffFile,
    currentDiffLines,
    currentDir,
    currentFile,
    currentTerminalCommand,
    displayFilePath,
    doCommit,
    doSearch,
    editorRef,
    executeApprovedPlan,
    extSearchQuery,
    extSearchResults,
    extSearching,
    fileTree,
    files,
    gitFiles,
    gitLoading,
    handleScan,
    input,
    activateExtension,
    deactivateExtension,
    onSuggestExtensionShim,
    installExtension,
    installLocalVsix,
    interruptTerminalCommand,
    isExtensionInstalled,
    isRunning,
    legs,
    loadingFiles,
    loadGitStatus,
    loading,
    menuItems,
    menuOpen,
    messages,
    monacoRef,
    onFileClick,
    onRepairExtensionShim,
    openFolder,
    onWorkflowErrorDismiss,
    projectName,
    projects,
    projectsOpen,
    refreshRuntimeInspector,
    rejectDiffFile,
    rejectTerminalCommand,
    repairingShimFor,
    approveTerminalCommand,
    reset,
    rightPanelOpen,
    rightPanelTab,
    rightPanelWidth,
    runCommand,
    runProcess,
    runtimeControlPlane,
    runtimeGraph,
    runtimeMetrics,
    runtimeReplay,
    runtimeTasks,
    runtimeTrace,
    runtimeTree,
    runtimeWorkers,
    selectedTraceId,
    searchExtensions,
    searchInputRef,
    searchQuery,
    searchResults,
    searching,
    selectedExtension,
    selectedModel,
    selectedRuntimeTask,
    send,
    setActiveActivity,
    setActiveFile,
    setCommitMsg,
    setExtSearchQuery,
    setFiles,
    setInput,
    setMenuOpen,
    setProjectsOpen,
    setRightPanelOpen,
    setRightPanelTab,
    setSearchQuery,
    setSelectedExtension,
    setSelectedModel,
    setSelectedRuntimeTask,
    setSidebarOpen,
    setTerminalInput,
    setTerminalOpen,
    setTerminalTab,
    setTheme,
    setThemeOpen,
    setTimelineEvents,
    sidebarOpen,
    sidebarWidth,
    startRightPanelResize,
    startSidebarResize,
    startTerminalResize,
    switchProject,
    t,
    terminalBottomRef,
    terminalBusy,
    terminalHeight,
    terminalHistory,
    terminalInput,
    terminalOpen,
    terminalTab,
    theme,
    themeOpen,
    timelineEvents,
    traceSpans,
    toggleRun,
    auditResults,
    onAuditRun,
    uninstallExtension,
    workflowError,
    isCommandPaletteOpen,
    closeCommandPalette,
    onCommandPaletteAction,
  } = props;

  const isGlass = theme === 'glass';

  return (
    <div
      className={`theme-${theme}`}
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh',
        background: t.bg, color: t.text,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        position: 'relative', overflow: 'hidden',
      }}
      onClick={() => menuOpen && setMenuOpen(null)}
    >
      {/* ─── Стили глобальные ─────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar       { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
        .octopusDiffAdded    { background: rgba(46, 160, 67, 0.22);  transition: background 0.9s ease; }
        .octopusDiffRemoved  { background: rgba(248, 81, 73, 0.22);  transition: background 0.9s ease; }
        .octopusDiffModified { background: rgba(210, 153, 34, 0.24); transition: background 0.9s ease; }
        .octopusDiffFade     { background: transparent; }
        ${isGlass ? `
          /* ── Glass Theme — Panel Glass Effects ──────────────────── */
          .theme-glass .activity-btn { color: rgba(167,139,250,0.75); }
          /* Dropdown menus */
          .theme-glass [style*="background: rgb(22, 27, 34)"],
          .theme-glass [style*="background: rgb(13, 17, 23)"],
          .theme-glass [style*="background: rgb(16, 21, 28)"] {
            backdrop-filter: blur(24px) saturate(1.7) !important;
            -webkit-backdrop-filter: blur(24px) saturate(1.7) !important;
            background: rgba(18, 10, 46, 0.88) !important;
            border-color: rgba(167, 139, 250, 0.18) !important;
            box-shadow: 0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(100,60,200,0.10), inset 0 1px 0 rgba(255,255,255,0.06) !important;
          }
        ` : ''}
      `}</style>

      {/* ─── طبقة خلفية Glassmorphism ──────────────────────────────── */}
      {isGlass && (
        <div className="glass-bg-layer" aria-hidden="true">
          <div className="glass-orb glass-orb-1" />
          <div className="glass-orb glass-orb-2" />
          <div className="glass-orb glass-orb-3" />
          <div className="glass-orb glass-orb-4" />
        </div>
      )}

      {/* ─── شريط العنوان ─────────────────────────────────────────── */}
      <TitleBar
        currentDir={currentDir}
        doSearch={doSearch}
        loading={loading}
        menuItems={menuItems}
        menuOpen={menuOpen}
        onOpenFolder={openFolder}
        onProjectSelect={switchProject}
        onSearchActivity={() => { setActiveActivity('search'); setSidebarOpen(true); }}
        onThemeSelect={(key) => { setTheme(key); setThemeOpen(false); }}
        projectName={projectName}
        projects={projects}
        projectsOpen={projectsOpen}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        setMenuOpen={setMenuOpen}
        setProjectsOpen={setProjectsOpen}
        setSearchQuery={setSearchQuery}
        setThemeOpen={setThemeOpen}
        t={t}
        theme={theme}
        themeOpen={themeOpen}
      />

      {/* ─── بانر خطأ العمل ───────────────────────────────────────── */}
      {workflowError && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px',
            background: '#3d1117',
            borderBottom: '1px solid #da3633',
            color: '#ffd8d8', fontSize: 12, flexShrink: 0,
          }}
        >
          <i className="codicon codicon-error" style={{ color: '#ff7b72', fontSize: 14 }} />
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Workflow interrupted</span>
          <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workflowError.message}
          </span>
          {workflowError.detail && (
            <span dir="auto" style={{ color: 'rgba(255,216,216,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workflowError.detail}
            </span>
          )}
          <button
            title="Dismiss"
            onClick={onWorkflowErrorDismiss}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ffd8d8', cursor: 'pointer', width: 24, height: 24 }}
          >
            <i className="codicon codicon-close" />
          </button>
        </div>
      )}

      {/* ─── الجسم الأفقي الرئيسي ─────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ActivityBar — الشريط الجانبي الضيق */}
        <ActivityBar
          activeActivity={activeActivity}
          loading={loading}
          onActivityChange={(activityId) => {
            // Workspace Launcher — يفتح في المنطقة الرئيسية بدون sidebar
            if (activityId === 'workspace') {
              if (activeActivity === 'workspace') {
                setActiveActivity('explorer');
              } else {
                setActiveActivity('workspace');
                setSidebarOpen(false);
              }
              return;
            }
            if (activeActivity === activityId) setSidebarOpen(p => !p);
            else { setActiveActivity(activityId); setSidebarOpen(true); }
          }}
          onOpenFolder={openFolder}
          onScanProject={handleScan}
          onTerminalToggle={() => { setTerminalOpen(open => !open); setTerminalTab('terminal'); }}
          t={t}
        />

        {/* SidePanel — الشريط الجانبي مع التبويبات */}
        <SidePanel
          activeActivity={activeActivity}
          activeFile={activeFile}
          commitMsg={commitMsg}
          createScratchFile={createScratchFile}
          currentDir={currentDir}
          displayFilePath={displayFilePath}
          doCommit={doCommit}
          doSearch={doSearch}
          extSearchQuery={extSearchQuery}
          extSearchResults={extSearchResults}
          extSearching={extSearching}
          fileTree={fileTree}
          files={files}
          gitFiles={gitFiles}
          gitLoading={gitLoading}
          installExtension={installExtension}
          installLocalVsix={installLocalVsix}
          isExtensionInstalled={isExtensionInstalled}
          loadGitStatus={loadGitStatus}
          onFileClick={onFileClick}
          onOpenTerminal={(mode, opts) => {
            setTerminalOpen(true);
            if (mode === 'test') setTimeout(() => setTerminalInput('npm test'), 120);
            else if (opts?.cwd) setTimeout(() => setTerminalInput(`cd "${opts.cwd}"`), 120);
          }}
          onSetActiveFile={setActiveFile}
          searchExtensions={searchExtensions}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searching={searching}
          setCommitMsg={setCommitMsg}
          setExtSearchQuery={setExtSearchQuery}
          setSearchQuery={setSearchQuery}
          setSelectedExtension={setSelectedExtension}
          sidebarOpen={sidebarOpen}
          sidebarWidth={sidebarWidth}
          startSidebarResize={startSidebarResize}
          t={t}
        />

        {/* MainArea — محرر الكود + الـ Terminal */}
        <MainArea
          launcherOpen={activeActivity === 'workspace'}
          onCloseLauncher={() => setActiveActivity('explorer')}
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
          input={input}
          installExtension={installExtension}
          isExtensionInstalled={isExtensionInstalled}
          isRunning={isRunning}
          loading={loading}
          loadingFiles={loadingFiles}
          messages={messages}
          monacoRef={monacoRef}
          onApproveTerminal={approveTerminalCommand}
          onActivateSidebar={(panel) => { setActiveActivity(panel); setSidebarOpen(true); }}
          onClear={clearTerminal}
          onClose={() => setTerminalOpen(false)}
          onCommandChange={setTerminalInput}
          onErrorDetected={props.onTerminalError}
          onInterrupt={interruptTerminalCommand}
          onOpenChat={() => { setTerminalOpen(true); setTerminalTab('chat'); }}
          onOpenFolder={openFolder}
          onOpenRightPanel={() => setRightPanelOpen(true)}
          onOpenTerminal={(mode, opts) => {
            setTerminalOpen(true);
            if (mode === 'test') setTimeout(() => setTerminalInput('npm test'), 120);
            else if (opts?.cwd) setTimeout(() => setTerminalInput(`cd "${opts.cwd}"`), 120);
          }}
          onResizeStart={startTerminalResize}
          onRunCommand={runCommand}
          onRejectTerminal={rejectTerminalCommand}
          onSuggestExtensionShim={onSuggestExtensionShim}
          onTabChange={setTerminalTab}
          projectName={projectName}
          selectedExtension={selectedExtension}
          selectedModel={selectedModel}
          send={send}
          setActiveFile={setActiveFile}
          setFiles={setFiles}
          setInput={setInput}
          setSelectedModel={setSelectedModel}
          setSelectedExtension={setSelectedExtension}
          t={t}
          terminalBottomRef={terminalBottomRef}
          terminalBusy={terminalBusy}
          terminalCommand={currentTerminalCommand}
          terminalHeight={terminalHeight}
          terminalHistory={terminalHistory}
          terminalInput={terminalInput}
          terminalOpen={terminalOpen}
          terminalTab={terminalTab}
          uninstallExtension={uninstallExtension}
          workflowError={workflowError}
        />

        {/* RightPanel — اللوحة اليمنى */}
        <RightPanel
          activeFile={activeFile}
          awaitingConfirm={awaitingConfirm}
          bottomRef={bottomRef}
          cancelPlan={cancelPlan}
          currentDir={currentDir}
          displayFilePath={displayFilePath}
          executeApprovedPlan={executeApprovedPlan}
          files={files}
          input={input}
          legs={legs}
          loading={loading}
          messages={messages}
          onRepairExtensionShim={onRepairExtensionShim}
          onOpenChat={() => { setTerminalOpen(true); setTerminalTab('chat'); }}
          auditResults={auditResults}
          onAuditRun={onAuditRun}
          onResizeStart={startRightPanelResize}
          onRuntimeRefresh={refreshRuntimeInspector}
          onTimelineClear={() => setTimelineEvents([])}
          projectName={projectName}
          reset={reset}
          repairingShimFor={repairingShimFor}
          rightPanelOpen={rightPanelOpen}
          rightPanelTab={rightPanelTab}
          rightPanelWidth={rightPanelWidth}
          runtimeControlPlane={runtimeControlPlane}
          runtimeGraph={runtimeGraph}
          runtimeMetrics={runtimeMetrics}
          runtimeReplay={runtimeReplay}
          runtimeTasks={runtimeTasks}
          runtimeTrace={runtimeTrace}
          runtimeTree={runtimeTree}
          runtimeWorkers={runtimeWorkers}
          selectedTraceId={selectedTraceId}
          selectedRuntimeTask={selectedRuntimeTask}
          send={send}
          setActiveFile={setActiveFile}
          setInput={setInput}
          setRightPanelOpen={setRightPanelOpen}
          setRightPanelTab={setRightPanelTab}
          setSelectedRuntimeTask={setSelectedRuntimeTask}
          t={t}
          timelineEvents={timelineEvents}
          traceSpans={traceSpans}
        />
      </div>

      {/* ─── عناصر عائمة / مودال ──────────────────────────────────── */}
      <OctopusWorking active={loading} legs={legs} />

      <DiffApprovalModal
        currentDiffFile={currentDiffFile}
        currentDiffLines={currentDiffLines}
        onAccept={acceptDiffFile}
        onReject={rejectDiffFile}
        t={t}
      />

      <StatusBar
        currentFile={currentFile}
        displayFilePath={displayFilePath}
        isRunning={isRunning}
        onRunToggle={toggleRun}
        onThemeClick={() => setThemeOpen(p => !p)}
        runProcess={runProcess}
        t={t}
        theme={theme}
      >
        <RuntimeStatusBar legs={legs} loading={loading} t={t} />
      </StatusBar>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        onAction={onCommandPaletteAction}
        recentFiles={files ? files.slice(0, 5).map(f => ({ name: f.name })) : []}
        t={t}
      />
    </div>
  );
}
