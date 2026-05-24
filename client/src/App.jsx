import { useState, useRef } from "react";
import '@vscode/codicons/dist/codicon.css';
import { ActivityBar } from './components/ActivityBar';
import { DiffApprovalModal } from './components/DiffApprovalModal';
import { EditorWorkspace } from './components/EditorWorkspace';
import { ExplorerPanel } from './components/ExplorerPanel';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { GitPanel } from './components/GitPanel';
import { OctopusWorking } from './components/OctopusWorking';
import { RightPanel } from './components/RightPanel';
import { SearchPanel } from './components/SearchPanel';
import { SidebarShell } from './components/SidebarShell';
import { StatusBar } from './components/StatusBar';
import { TerminalPanel } from './components/TerminalPanel';
import { TerminalApprovalModal } from './components/TerminalApprovalModal';
import { TitleBar } from './components/TitleBar';
import { INITIAL_LEGS, SESSION_ID, THEMES } from './config/uiConfig';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useOctopusWorkflow } from './hooks/useOctopusWorkflow';
import { useTerminalApprovals } from './hooks/useTerminalApprovals';
import { extensionsApi, filesApi, gitApi, terminalApi, workspaceApi } from './services/apiClient';
import { INITIAL_CHAT_MESSAGES, OCTOPUS_ABOUT_MESSAGE } from './utils/chatMessages';
import { buildLineDiff, getSavedFileName } from './utils/diffUtils';
import { applyDiffDecorations as decorateEditorDiff, clearDiffDecorations } from './utils/editorDiffDecorations';
import { advanceLegProgress, finishLeg, resetLegState, startLeg } from './utils/legState';
import { upsertAcceptedDiffFile, upsertOpenedFile } from './utils/openFilesState';
import { startHorizontalResize, startVerticalResize } from './utils/panelResize';
import { displayFilePath as formatFilePath } from './utils/pathDisplay';
import { detectRunCommand } from './utils/projectRunCommand';
import { addRecentProject, getFolderName } from './utils/recentProjects';
import { TERMINAL_READY_ENTRY, terminalErrorEntry, terminalInputEntry, terminalOutputEntry, terminalPlainErrorEntry, terminalResultEntry, terminalRunEntry, terminalSystemEntry } from './utils/terminalHistory';

export default function App() {
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState("");
  const [legs, setLegs] = useState(INITIAL_LEGS);
  const [messages, setMessages] = useState(INITIAL_CHAT_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [themeOpen, setThemeOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState([TERMINAL_READY_ENTRY]);
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
  const [pendingDiffFiles, setPendingDiffFiles] = useState([]);
  const [pendingTerminalCommands, setPendingTerminalCommands] = useState([]);
  const bottomRef = useRef(null);
  const terminalBottomRef = useRef(null);
  const searchInputRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const diffDecorationsRef = useRef([]);
  const t = THEMES[theme];

  useAutoScroll(bottomRef, messages);
  useAutoScroll(terminalBottomRef, terminalHistory);

  useAppShortcuts({ searchInputRef, setSidebarOpen, setTerminalOpen });

  function startSidebarResize(e) {
    startHorizontalResize(e, {
      currentWidth: sidebarWidth,
      maxWidth: 350,
      minWidth: 150,
      setWidth: setSidebarWidth,
    });
  }

  function startTerminalResize(e) {
    startVerticalResize(e, {
      currentHeight: terminalHeight,
      maxHeight: 400,
      minHeight: 80,
      setHeight: setTerminalHeight,
    });
  }

  async function onFileClick(item) {
    setActiveFile(item.name);
    const already = files.find(f => f.path === item.path);
    if (already?.content) return;
    try {
      const data = await filesApi.read({ filePath: item.path, projectDir: currentDir });
      if (data.success) setFiles(prev => upsertOpenedFile(prev, item, data.content));
    } catch {
      setTerminalHistory(prev => [...prev, terminalPlainErrorEntry('Could not read file.')]);
    }
  }

  async function openFolder() {
    if (!window.octopus) return;
    const folderPath = await window.octopus.openFolder();
    if (!folderPath) return;
    const name = getFolderName(folderPath);

    setProjects(prev => addRecentProject(prev, { name, path: folderPath }));
    setProjectName(name);
    setCurrentDir(folderPath);
    const data = await filesApi.list(folderPath);
    if (data.success) { setFileTree(data.items); setFiles([]); setActiveFile(''); setGitFiles([]); }
  }

  async function switchProject(project) {
    setProjectName(project.name);
    setCurrentDir(project.path);
    setFiles([]);
    setActiveFile('');
    setGitFiles([]);
    setProjectsOpen(false);
    const data = await filesApi.list(project.path);
    if (data.success) setFileTree(data.items);
  }

  async function runCommand(cmd) {
    if (!cmd.trim()) return;
    setTerminalHistory(prev => [...prev, terminalInputEntry(cmd)]);
    setTerminalInput('');
    setTerminalOpen(true);
    setTerminalTab('terminal');

    try {
      const controller = new AbortController();
      const data = await terminalApi.command({ command: cmd, cwd: currentDir, signal: controller.signal });
      setTerminalHistory(prev => [...prev, terminalResultEntry(data)]);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setTerminalHistory(prev => [...prev, terminalErrorEntry(e.message)]);
      }
    }
  }

  async function toggleRun() {
    if (isRunning) {
      const data = await terminalApi.stop();
      setIsRunning(false);
      setRunProcess(null);
      setTerminalHistory(prev => [...prev, terminalSystemEntry(data.output)]);
      return;
    }

    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalTab('terminal');

    const command = detectRunCommand(fileTree);

    setRunProcess(command);
    setTerminalHistory(prev => [...prev, terminalRunEntry(command)]);

    try {
      const data = await terminalApi.run({ command, cwd: currentDir });
      setTerminalHistory(prev => [...prev, terminalOutputEntry(data.output)]);
    } catch {
      setTerminalHistory(prev => [...prev, terminalErrorEntry('Run error')]);
      setIsRunning(false);
      setRunProcess(null);
    }
  }

  async function doSearch(q) {
    if (!q.trim() || !currentDir) return;
    setSearching(true);
    try {
      const data = await workspaceApi.search({ query: q, dirPath: currentDir });
      if (data.success) setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }

  async function loadGitStatus() {
    if (!currentDir) return;
    setGitLoading(true);
    try {
      const data = await gitApi.status(currentDir);
      if (data.success) setGitFiles(data.files);
    } catch {
      setGitFiles([]);
    }
    setGitLoading(false);
  }

  async function doCommit() {
    if (!commitMsg.trim()) return;
    const data = await gitApi.commit({ cwd: currentDir, message: commitMsg });
    setTerminalHistory(prev => [...prev, terminalResultEntry(data)]);
    setTerminalOpen(true);
    setCommitMsg('');
    loadGitStatus();
  }

  const { approveTerminalCommand, queueTerminalCommand, rejectTerminalCommand } = useTerminalApprovals({
    pendingTerminalCommands,
    runCommand,
    setPendingTerminalCommands,
    setTerminalHistory,
    setTerminalOpen,
    setTerminalTab,
  });

  function activateLeg(id, task) {
    setLegs(prev => startLeg(prev, id, task));
    const interval = setInterval(() => {
      setLegs(prev => {
        const leg = prev.find(l => l.id === id);
        if (!leg || leg.progress >= 100) {
          clearInterval(interval);
          return prev;
        }
        return advanceLegProgress(prev, id);
      });
    }, 200);
  }

  function completeLeg(id) { setLegs(prev => finishLeg(prev, id)); }
  function resetLegs() { setLegs(resetLegState()); }

  function applyDiffDecorations(file, fade = false) {
    decorateEditorDiff({
      decorationsRef: diffDecorationsRef,
      editor: editorRef.current,
      file,
      fade,
      monaco: monacoRef.current,
    });
  }
  function showAcceptedDiffDecorations(file) {
    setTimeout(() => {
      applyDiffDecorations(file);
      setTimeout(() => {
        applyDiffDecorations(file, true);
        setTimeout(() => {
          clearDiffDecorations({ decorationsRef: diffDecorationsRef, editor: editorRef.current });
        }, 900);
      }, 5000);
    }, 120);
  }
  async function refreshFileTree() {
    if (!currentDir) return;
    filesApi.list(currentDir).then(d => { if (d.success) setFileTree(d.items); });
  }
  async function acceptDiffFile(file) {
    const readPath = file.relativePath || file.path;
    const fileName = getSavedFileName(file);
    await filesApi.write({ filePath: readPath, content: file.newContent, projectDir: currentDir });
    setFiles(prev => upsertAcceptedDiffFile(prev, file, fileName));
    setActiveFile(fileName);
    setPendingDiffFiles(prev => prev.slice(1));
    refreshFileTree();
    showAcceptedDiffDecorations(file);
  }
  function rejectDiffFile() {
    setPendingDiffFiles(prev => prev.slice(1));
  }

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
    sessionId: SESSION_ID,
    setActiveFile,
    setAwaitingConfirm,
    setFileTree,
    setFiles,
    setInput,
    setLoading,
    setMessages,
    setPendingDiffFiles,
    setPendingPlan,
  });

  function onKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  const currentFile = files.find(f => f.name === activeFile);
  const displayFilePath = (file) => formatFilePath({ file, activeFile, currentDir, projectName });
  const createScratchFile = () => {
    const name = prompt("File name:");
    if (name) setFiles(prev => [...prev, { name, content: "" }]);
    setActiveFile(name || '');
  };

  async function searchExtensions(query) {
    if (!query.trim()) {
      setExtSearchResults([]);
      return;
    }
    setExtSearching(true);
    try {
      const data = await extensionsApi.search(query);
      setExtSearchResults(data.extensions || []);
    } catch (error) {
      console.error('Failed to search extensions:', error);
      setExtSearchResults([]);
    }
    setExtSearching(false);
  }

  async function installExtension(extension) {
    try {
      const data = await extensionsApi.install(extension);
      if (data.success) {
        setInstalledExtensions(prev => [...prev, extension]);
      }
    } catch (error) {
      console.error('Failed to install extension:', error);
    }
  }

  async function uninstallExtension(extensionId) {
    try {
      const data = await extensionsApi.uninstall(extensionId);
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

  const currentDiffFile = pendingDiffFiles[0];
  const currentTerminalCommand = pendingTerminalCommands[0];
  const currentDiffLines = currentDiffFile
    ? (currentDiffFile.diff || buildLineDiff(currentDiffFile.oldContent, currentDiffFile.newContent)).filter(line => line.startsWith('-') || line.startsWith('+'))
    : [];
  const titleMenuItems = [
    {
      id: 'file', label: 'File',
      items: [
        { label: 'Open Folder...', icon: 'codicon-folder-opened', action: () => openFolder(), shortcut: 'Ctrl+O' },
        { label: 'New File', icon: 'codicon-new-file', action: createScratchFile, shortcut: 'Ctrl+N' },
        { separator: true },
        { label: 'Save', icon: 'codicon-save', action: async () => { const cf = files.find(f => f.name === activeFile); if (cf?.path && cf.content !== undefined) { await filesApi.write({ filePath: cf.path, content: cf.content }); } }, shortcut: 'Ctrl+S' },
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
        { label: 'About Octopus', icon: 'codicon-info', action: () => setMessages(prev => [...prev, OCTOPUS_ABOUT_MESSAGE]) },
        { label: 'Extensions', icon: 'codicon-extensions', action: () => { setActiveActivity('extensions'); setSidebarOpen(true); } },
      ]
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: t.bg, color: t.text, fontFamily: "'Inter', 'Segoe UI', sans-serif" }} onClick={() => menuOpen && setMenuOpen(null)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
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
        menuItems={titleMenuItems}
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


      {/* Main Layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        <ActivityBar
          activeActivity={activeActivity}
          onActivityChange={(activityId) => {
            if (activeActivity === activityId) setSidebarOpen(p => !p);
            else { setActiveActivity(activityId); setSidebarOpen(true); }
          }}
          onOpenFolder={openFolder}
          t={t}
        />

        {/* Sidebar */}
        {sidebarOpen && <SidebarShell
          activeActivity={activeActivity}
          onCreateFile={createScratchFile}
          sidebarWidth={sidebarWidth}
          t={t}
        >
          {activeActivity === 'explorer' && (
            <ExplorerPanel
              activeFile={activeFile}
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
              searchExtensions={searchExtensions}
              t={t}
            />
          )}
        </SidebarShell>}

        {/* Resize Handle */}
        <div style={{ width: 3, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseDown={startSidebarResize}
          onMouseEnter={e => e.currentTarget.style.background = t.accent}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />

        {/* Editor + Terminal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          <EditorWorkspace
            activeFile={activeFile}
            currentFile={currentFile}
            displayFilePath={displayFilePath}
            editorRef={editorRef}
            files={files}
            installExtension={installExtension}
            isExtensionInstalled={isExtensionInstalled}
            monacoRef={monacoRef}
            selectedExtension={selectedExtension}
            setActiveFile={setActiveFile}
            setFiles={setFiles}
            setSelectedExtension={setSelectedExtension}
            t={t}
            uninstallExtension={uninstallExtension}
          />

          {terminalOpen && (
            <TerminalPanel
              onClear={() => setTerminalHistory([TERMINAL_READY_ENTRY])}
              onClose={() => setTerminalOpen(false)}
              onCommandChange={setTerminalInput}
              onRunCommand={runCommand}
              onResizeStart={startTerminalResize}
              onTabChange={setTerminalTab}
              t={t}
              terminalBottomRef={terminalBottomRef}
              terminalHeight={terminalHeight}
              terminalHistory={terminalHistory}
              terminalInput={terminalInput}
              terminalTab={terminalTab}
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
          onKey={onKey}
          projectName={projectName}
          reset={reset}
          rightPanelOpen={rightPanelOpen}
          rightPanelTab={rightPanelTab}
          send={send}
          setActiveFile={setActiveFile}
          setInput={setInput}
          setRightPanelOpen={setRightPanelOpen}
          setRightPanelTab={setRightPanelTab}
          setTerminalOpen={setTerminalOpen}
          t={t}
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
      />
    </div>
  );
}
