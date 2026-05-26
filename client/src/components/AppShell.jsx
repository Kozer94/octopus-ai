import { ActivityBar } from './ActivityBar';
import { CommandPalette } from './CommandPalette';
import { DiffApprovalModal } from './DiffApprovalModal';
import { EditorWorkspace } from './EditorWorkspace';
import { ExplorerPanel } from './ExplorerPanel';
import { ExtensionsPanel } from './ExtensionsPanel';
import { GitPanel } from './GitPanel';
import { OctopusWorking } from './OctopusWorking';
import { RightPanel } from './RightPanel';
import { RuntimeStatusBar } from './RuntimePulse';
import { SearchPanel } from './SearchPanel';
import { SidebarShell } from './SidebarShell';
import { StatusBar } from './StatusBar';
import { TerminalPanel } from './TerminalPanel';
import { TerminalApprovalModal } from './TerminalApprovalModal';
import { TitleBar } from './TitleBar';

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
    installExtension,
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
    openFolder,
    onWorkflowErrorDismiss,
    projectName,
    projects,
    projectsOpen,
    refreshRuntimeInspector,
    rejectDiffFile,
    rejectTerminalCommand,
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
    searchInputRef,
    searchQuery,
    searchResults,
    searching,
    selectedExtension,
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
    toggleRun,
    auditResults,
    onAuditRun,
    uninstallExtension,
    workflowError,
    isCommandPaletteOpen,
    closeCommandPalette,
    onCommandPaletteAction,
  } = props;

  return (
    <div className={`theme-${theme}`} style={{ display: "flex", flexDirection: "column", height: "100vh", background: t.bg, color: t.text, fontFamily: "'Inter', 'Segoe UI', sans-serif", position: 'relative', overflow: 'hidden' }} onClick={() => menuOpen && setMenuOpen(null)}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
        .octopusDiffAdded { background: rgba(46, 160, 67, 0.22); transition: background 0.9s ease; }
        .octopusDiffRemoved { background: rgba(248, 81, 73, 0.22); transition: background 0.9s ease; }
        .octopusDiffModified { background: rgba(210, 153, 34, 0.24); transition: background 0.9s ease; }
        .octopusDiffFade { background: transparent; }
      `}</style>

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

      {workflowError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            background: '#3d1117',
            borderBottom: '1px solid #da3633',
            color: '#ffd8d8',
            fontSize: 12,
            flexShrink: 0,
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ActivityBar
          activeActivity={activeActivity}
          loading={loading}
          onActivityChange={(activityId) => {
            if (activeActivity === activityId) setSidebarOpen(p => !p);
            else { setActiveActivity(activityId); setSidebarOpen(true); }
          }}
          onOpenFolder={openFolder}
          onScanProject={handleScan}
          onTerminalToggle={() => {
            setTerminalOpen(open => !open);
            setTerminalTab('terminal');
          }}
          t={t}
        />

        {sidebarOpen && <SidebarShell
          activeActivity={activeActivity}
          onCreateFile={createScratchFile}
          sidebarWidth={sidebarWidth}
          t={t}
        >
          {activeActivity === 'explorer' && (
            <ExplorerPanel
              activeFile={activeFile}
              currentDir={currentDir}
              displayFilePath={displayFilePath}
              files={files}
              fileTree={fileTree}
              onFileClick={onFileClick}
              onSetActiveFile={setActiveFile}
              t={t}
            />
          )}
          {activeActivity === 'search' && (
            <SearchPanel
              onFileClick={onFileClick}
              onQueryChange={setSearchQuery}
              onSearch={doSearch}
              searchQuery={searchQuery}
              searchResults={searchResults}
              searching={searching}
              t={t}
            />
          )}
          {activeActivity === 'git' && (
            <GitPanel
              commitMsg={commitMsg}
              gitFiles={gitFiles}
              gitLoading={gitLoading}
              onCommit={doCommit}
              onCommitMsgChange={setCommitMsg}
              onRefresh={loadGitStatus}
              t={t}
            />
          )}
          {activeActivity === 'extensions' && (
            <ExtensionsPanel
              extSearchQuery={extSearchQuery}
              extSearchResults={extSearchResults}
              extSearching={extSearching}
              installExtension={installExtension}
              isExtensionInstalled={isExtensionInstalled}
              onQueryChange={setExtSearchQuery}
              onSelectExtension={setSelectedExtension}
              searchExtensions={props.searchExtensions}
              t={t}
            />
          )}
        </SidebarShell>}

        <div className="resize-handle" style={{ width: 3, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseDown={startSidebarResize}
          onMouseEnter={e => e.currentTarget.style.background = t.accent}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />

        <div className="elevation-1" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)' }}>
          <EditorWorkspace
            activeFile={activeFile}
            currentDir={currentDir}
            currentFile={currentFile}
            displayFilePath={displayFilePath}
            editorRef={editorRef}
            files={files}
            installExtension={installExtension}
            isExtensionInstalled={isExtensionInstalled}
            loadingFiles={loadingFiles}
            monacoRef={monacoRef}
            projectName={projectName}
            selectedExtension={selectedExtension}
            setActiveFile={setActiveFile}
            setFiles={setFiles}
            setSelectedExtension={setSelectedExtension}
            t={t}
            uninstallExtension={uninstallExtension}
          />

          {terminalOpen && (
            <TerminalPanel
              currentDir={currentDir}
              isRunning={isRunning || terminalBusy}
              onClear={clearTerminal}
              onClose={() => setTerminalOpen(false)}
              onCommandChange={setTerminalInput}
              onInterrupt={interruptTerminalCommand}
              onRunCommand={runCommand}
              onResizeStart={startTerminalResize}
              onTabChange={setTerminalTab}
              t={t}
              terminalBottomRef={terminalBottomRef}
              terminalHeight={terminalHeight}
              terminalHistory={terminalHistory}
              terminalInput={terminalInput}
              terminalTab={terminalTab}
              workflowError={workflowError}
            />
          )}
        </div>

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
          auditResults={auditResults}
          onAuditRun={onAuditRun}
          onResizeStart={startRightPanelResize}
          onRuntimeRefresh={refreshRuntimeInspector}
          onTimelineClear={() => setTimelineEvents([])}
          projectName={projectName}
          reset={reset}
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
          selectedRuntimeTask={selectedRuntimeTask}
          send={send}
          setActiveFile={setActiveFile}
          setInput={setInput}
          setRightPanelOpen={setRightPanelOpen}
          setRightPanelTab={setRightPanelTab}
          setSelectedRuntimeTask={setSelectedRuntimeTask}
          t={t}
          timelineEvents={timelineEvents}
        />
      </div>

      <OctopusWorking active={loading} legs={legs} />

      <DiffApprovalModal
        currentDiffFile={currentDiffFile}
        currentDiffLines={currentDiffLines}
        onAccept={acceptDiffFile}
        onReject={rejectDiffFile}
        t={t}
      />

      <TerminalApprovalModal
        command={currentTerminalCommand}
        onApprove={approveTerminalCommand}
        onReject={rejectTerminalCommand}
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
