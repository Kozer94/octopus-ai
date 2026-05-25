import { useState } from 'react';
import { gitApi } from '../services/apiClient';
import { terminalResultEntry } from '../utils/terminalHistory';

export function useGitStatus({ currentDir, setTerminalHistory, setTerminalOpen }) {
  const [gitFiles, setGitFiles] = useState([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [gitLoading, setGitLoading] = useState(false);

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

  function clearGitFiles() {
    setGitFiles([]);
  }

  return {
    clearGitFiles,
    commitMsg,
    doCommit,
    gitFiles,
    gitLoading,
    loadGitStatus,
    setCommitMsg,
  };
}
