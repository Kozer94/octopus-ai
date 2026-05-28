import { terminalApprovalEntry, terminalSkippedEntry } from '../utils/terminalHistory';
import { analyzeTerminalCommandRisk } from '../utils/terminalRisk';

export function useTerminalApprovals({
  pendingTerminalCommands,
  runCommand,
  setPendingTerminalCommands,
  setTerminalHistory,
  setTerminalOpen,
  setTerminalTab,
}) {
  function queueTerminalCommand(value) {
    const command = String(value || '').trim();
    if (!command) return;

    setPendingTerminalCommands(prev => [...prev, command]);
    setTerminalOpen(true);
    setTerminalTab('chat');
    setTerminalHistory(prev => [...prev, terminalApprovalEntry(command, analyzeTerminalCommandRisk(command))]);
  }

  async function approveTerminalCommand(command) {
    setPendingTerminalCommands(prev => prev.slice(1));
    await runCommand(command);
  }

  function rejectTerminalCommand() {
    const command = pendingTerminalCommands[0];
    setPendingTerminalCommands(prev => prev.slice(1));
    setTerminalHistory(prev => [...prev, terminalSkippedEntry(command)]);
  }

  return {
    approveTerminalCommand,
    queueTerminalCommand,
    rejectTerminalCommand,
  };
}
