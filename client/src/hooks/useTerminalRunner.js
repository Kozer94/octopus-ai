import { useRef, useState } from 'react';
import { terminalApi } from '../services/apiClient';
import { detectRunCommand } from '../utils/projectRunCommand';
import {
  TERMINAL_READY_ENTRY,
  appendTerminalOutputChunk,
  finishTerminalStream,
  terminalErrorEntry,
  terminalExitEntry,
  terminalInputEntry,
  terminalOutputEntry,
  terminalRunEntry,
  terminalSystemEntry,
} from '../utils/terminalHistory';

/**
 * يحوّل أخطاء البنية التحتية الخام إلى رسائل واضحة للمستخدم
 */
function humanizeTerminalError(error) {
  const msg = String(error?.message || error || '');

  if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
    return [
      '⛔ Terminal execution blocked by runtime policy.',
      '',
      'Possible causes:',
      '  • Terminal capability not granted for your session',
      '  • Security policy denied execution',
      '  • PTY session expired — try closing and reopening the terminal',
      '',
      'If this persists: restart the server (npm run dev)',
    ].join('\n');
  }

  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
    return [
      '🔐 Authentication required.',
      '',
      'The server requires an API token.',
      'Set OCTOPUS_API_TOKEN in server/.env and restart.',
    ].join('\n');
  }

  if (msg.toLowerCase().includes('fetch failed') || msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('econnrefused')) {
    return [
      '📡 Cannot reach the Octopus server.',
      '',
      'The server at localhost:3001 is not responding.',
      'Run: npm run dev (or node server/supervisor.js)',
    ].join('\n');
  }

  if (msg.toLowerCase().includes('stream timed out') || msg.toLowerCase().includes('timed out')) {
    return [
      '⏱️ Command timed out.',
      '',
      'The process is still running in the background.',
      'Long-running commands (installs, builds) may exceed the timeout.',
    ].join('\n');
  }

  return msg;
}

export function useTerminalRunner({ currentDir, fileTree }) {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState([TERMINAL_READY_ENTRY]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalTab, setTerminalTab] = useState('terminal');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runProcess, setRunProcess] = useState(null);
  const terminalAbortRef = useRef(null);

  async function runCommand(cmd) {
    if (!cmd.trim()) return;
    if (terminalBusy) {
      setTerminalHistory(prev => [...prev, terminalErrorEntry('Terminal command already running. Stop it first with Ctrl+C.')]);
      return;
    }

    const controller = new AbortController();
    terminalAbortRef.current = controller;
    setTerminalBusy(true);
    setTerminalHistory(prev => [...prev, terminalInputEntry(cmd)]);
    setTerminalInput('');
    setTerminalOpen(true);
    setTerminalTab('terminal');

    let streamFinished = false;

    try {
      await terminalApi.stream({
        command: cmd,
        cwd: currentDir,
        signal: controller.signal,
        onMessage: message => {
          if (message.output) {
            setTerminalHistory(prev => appendTerminalOutputChunk(prev, message.output));
          }
          if (message.done) {
            streamFinished = true;
            setTerminalHistory(prev => [...finishTerminalStream(prev), terminalExitEntry(message.code ?? 0)]);
          }
        },
      });

      if (!streamFinished) {
        throw new Error('Terminal stream disconnected before process exit');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        // ترجمة أخطاء البنية التحتية إلى رسائل بشرية
        const humanError = humanizeTerminalError(e);
        setTerminalHistory(prev => [...finishTerminalStream(prev), terminalErrorEntry(humanError)]);
      }
    } finally {
      setTerminalBusy(false);
      terminalAbortRef.current = null;
    }
  }

  async function startProject() {
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

  async function stopProject() {
    const data = await terminalApi.stop();
    setIsRunning(false);
    setRunProcess(null);
    setTerminalHistory(prev => [...prev, terminalSystemEntry(data.output)]);
  }

  async function interruptTerminalCommand() {
    if (terminalBusy) {
      terminalAbortRef.current?.abort();
      const data = await terminalApi.interrupt();
      setTerminalBusy(false);
      terminalAbortRef.current = null;
      setTerminalHistory(prev => [...finishTerminalStream(prev), terminalSystemEntry(data.output)]);
      return;
    }

    await stopProject();
  }

  async function toggleRun() {
    if (isRunning) {
      await stopProject();
      return;
    }

    await startProject();
  }

  async function restartProject() {
    if (isRunning) await stopProject();
    await startProject();
  }

  function clearTerminal() {
    setTerminalHistory([TERMINAL_READY_ENTRY]);
  }

  return {
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
  };
}
