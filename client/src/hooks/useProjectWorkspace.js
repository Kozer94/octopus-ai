import { useState } from 'react';
import { filesApi } from '../services/apiClient';
import { upsertOpenedFile } from '../utils/openFilesState';
import { displayFilePath as formatFilePath } from '../utils/pathDisplay';
import { addRecentProject, getFolderName } from '../utils/recentProjects';
import { terminalPlainErrorEntry } from '../utils/terminalHistory';

function findTreeItemByName(items, name) {
  for (const item of items) {
    if (item.name === name) return item;
    const childMatch = item.children ? findTreeItemByName(item.children, name) : null;
    if (childMatch) return childMatch;
  }
  return null;
}

export function useProjectWorkspace({
  onProjectChange,
  onFileReadError,
  addOctopusMessage,
  activateSidebarPanel,
}) {
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState('');
  const [currentDir, setCurrentDir] = useState('');
  const [projectName, setProjectName] = useState('Octopus');
  const [projects, setProjects] = useState([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(new Set());

  const currentFile = files.find(f => f.name === activeFile);
  const displayFilePath = file => formatFilePath({ file, activeFile, currentDir, projectName });

  async function onFileClick(item) {
    setActiveFile(item.name);
    const already = files.find(f => f.path === item.path);
    if (already?.content) return;
    try {
      setLoadingFiles(prev => new Set(prev).add(item.name));
      const data = await filesApi.read({ filePath: item.path, projectDir: currentDir });
      if (data.success) setFiles(prev => upsertOpenedFile(prev, item, data.content));
    } catch {
      onFileReadError?.(terminalPlainErrorEntry('Could not read file.'));
    } finally {
      setLoadingFiles(prev => {
        const next = new Set(prev);
        next.delete(item.name);
        return next;
      });
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
    if (data.success) {
      setFileTree(data.items);
      setFiles([]);
      setActiveFile('');
      onProjectChange?.();
    }
  }

  async function switchProject(project) {
    setProjectName(project.name);
    setCurrentDir(project.path);
    setFiles([]);
    setActiveFile('');
    onProjectChange?.();
    setProjectsOpen(false);
    const data = await filesApi.list(project.path);
    if (data.success) setFileTree(data.items);
  }

  function createScratchFile() {
    const name = prompt('File name:');
    if (name) setFiles(prev => [...prev, { name, content: '' }]);
    setActiveFile(name || '');
  }

  async function saveCurrentFile() {
    if (currentFile?.path && currentFile.content !== undefined) {
      await filesApi.write({ filePath: currentFile.path, content: currentFile.content });
      addOctopusMessage(`Saved ${displayFilePath(currentFile)}`);
    }
  }

  async function saveAllOpenFiles() {
    const writableFiles = files.filter(file => file.path && file.content !== undefined);
    await Promise.all(writableFiles.map(file => filesApi.write({ filePath: file.path, content: file.content })));
    addOctopusMessage(`Saved ${writableFiles.length} open file${writableFiles.length === 1 ? '' : 's'}`);
  }

  function closeActiveFile() {
    if (!activeFile) return;
    const remaining = files.filter(file => file.name !== activeFile);
    setFiles(remaining);
    setActiveFile(remaining.at(-1)?.name || '');
  }

  function closeAllFiles() {
    setFiles([]);
    setActiveFile('');
  }

  async function copyCurrentFilePath() {
    const filePath = currentFile?.path || activeFile;
    if (!filePath) return;
    await navigator.clipboard?.writeText(filePath);
    addOctopusMessage(`Copied path: ${filePath}`);
  }

  function refreshFileTree() {
    if (!currentDir) return;
    filesApi.list(currentDir).then(d => { if (d.success) setFileTree(d.items); });
  }

  function openProjectFileByName(name) {
    activateSidebarPanel('explorer');
    const item = findTreeItemByName(fileTree, name);
    if (item) onFileClick(item);
    else setActiveFile(name);
  }

  return {
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
    onFileClick,
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
  };
}
