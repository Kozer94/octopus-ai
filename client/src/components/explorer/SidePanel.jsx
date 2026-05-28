// SidePanel.jsx — اللوحة الجانبية الكاملة (Explorer | Search | Git | Extensions)
// مستخرج من AppShell.jsx

import { ExplorerPanel }  from './ExplorerPanel';
import { ExtensionsPanel } from './ExtensionsPanel';
import { GitPanel }       from './GitPanel';
import { SearchPanel }    from './SearchPanel';
import { SidebarShell }   from '../layout/SidebarShell';

/**
 * SidePanel — غلاف اللوحة الجانبية مع التبديل بين الأنشطة
 *
 * Props:
 *   activeActivity      string  — النشاط النشط: 'explorer'|'search'|'git'|'extensions'
 *   activeFile          string
 *   commitMsg           string
 *   createScratchFile   fn
 *   currentDir          string
 *   displayFilePath     fn(file)→string
 *   doCommit            fn
 *   doSearch            fn
 *   extSearchQuery      string
 *   extSearchResults    array
 *   extSearching        boolean
 *   fileTree            array
 *   files               array
 *   gitFiles            array
 *   gitLoading          boolean
 *   installExtension    fn
 *   installLocalVsix    fn
 *   isExtensionInstalled fn
 *   loadGitStatus       fn
 *   onFileClick         fn(item)
 *   onSetActiveFile     fn(fileId)
 *   searchExtensions    fn
 *   searchQuery         string
 *   searchResults       array
 *   searching           boolean
 *   setCommitMsg        fn
 *   setExtSearchQuery   fn
 *   setSearchQuery      fn
 *   setSelectedExtension fn
 *   sidebarOpen         boolean
 *   sidebarWidth        number
 *   startSidebarResize  fn
 *   t                   object — theme
 */
export function SidePanel({
  activeActivity,
  activeFile,
  commitMsg,
  createScratchFile,
  currentDir,
  displayFilePath,
  doCommit,
  doSearch,
  extSearchQuery,
  extSearchResults,
  extSearching,
  fileTree,
  files,
  gitFiles,
  gitLoading,
  installExtension,
  installLocalVsix,
  isExtensionInstalled,
  loadGitStatus,
  onFileClick,
  onOpenTerminal,
  onSetActiveFile,
  searchExtensions,
  searchQuery,
  searchResults,
  searching,
  setCommitMsg,
  setExtSearchQuery,
  setSearchQuery,
  setSelectedExtension,
  sidebarOpen,
  sidebarWidth,
  startSidebarResize,
  t,
}) {
  if (!sidebarOpen) return null;

  return (
    <>
      <SidebarShell
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
            onOpenTerminal={onOpenTerminal}
            onSetActiveFile={onSetActiveFile}
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
            installLocalVsix={installLocalVsix}
            isExtensionInstalled={isExtensionInstalled}
            onQueryChange={setExtSearchQuery}
            onSelectExtension={setSelectedExtension}
            searchExtensions={searchExtensions}
            t={t}
          />
        )}
      </SidebarShell>

      {/* مقبض تغيير حجم الشريط الجانبي */}
      <div
        className="resize-handle"
        style={{ width: 3, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
        onMouseDown={startSidebarResize}
        onMouseEnter={e => { e.currentTarget.style.background = t.accent; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />
    </>
  );
}
