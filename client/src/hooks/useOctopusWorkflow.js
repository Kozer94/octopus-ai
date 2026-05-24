import { octopusApi } from '../services/apiClient';
import { openOctopusSavedFiles } from '../services/octopusSavedFiles';
import {
  OCTOPUS_BUSY_MESSAGE,
  OCTOPUS_CANCELLED_MESSAGE,
  OCTOPUS_CONNECT_ERROR_MESSAGE,
  OCTOPUS_RESET_MESSAGE,
  OCTOPUS_SCANNING_MESSAGE,
  octopusErrorMessage,
  octopusMessage,
  octopusScanErrorMessage,
  userMessage,
} from '../utils/chatMessages';
import { extractCode } from '../utils/diffUtils';
import { buildOpenFilesContext, isComplexOctopusTask } from '../utils/octopusPromptContext';
import { getTerminalCommandsFromResponse } from '../utils/octopusResponse';
import { upsertFileByName } from '../utils/openFilesState';

export function useOctopusWorkflow({
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
  projectDir,
  queueTerminalCommand,
  resetLegs,
  sessionId,
  setActiveFile,
  setAwaitingConfirm,
  setFileTree,
  setFiles,
  setInput,
  setLoading,
  setMessages,
  setPendingDiffFiles,
  setPendingPlan,
}) {
  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (awaitingConfirm) {
      setMessages(prev => [...prev, OCTOPUS_BUSY_MESSAGE]);
      return;
    }

    setInput('');
    setMessages(prev => [...prev, userMessage(text)]);
    setLoading(true);
    resetLegs();

    const openFilesContext = buildOpenFilesContext(files);
    const isComplexTask = isComplexOctopusTask(text);

    if (!isComplexTask) {
      activateLeg(1, 'Analyzing request...');
      const currentFile = files.find(file => file.name === activeFile);

      try {
        const data = await octopusApi.send({
          command: text,
          sessionId,
          activeFile,
          activeFileContent: currentFile?.content || '',
          projectContext: openFilesContext,
          projectDir,
        });

        getTerminalCommandsFromResponse(data).forEach(queueTerminalCommand);

        if (data.success) {
          const code = extractCode(data.result);
          if (code) setFiles(prev => upsertFileByName(prev, activeFile, code));
          completeLeg(1);
          setMessages(prev => [...prev, octopusMessage(data.result)]);
        } else {
          setMessages(prev => [...prev, octopusErrorMessage(data.error)]);
          resetLegs();
        }
      } catch {
        setMessages(prev => [...prev, OCTOPUS_CONNECT_ERROR_MESSAGE]);
        resetLegs();
      }

      setLoading(false);
      return;
    }

    activateLeg(1, 'Scanning project...');
    activateLeg(2, 'Planning tasks...');
    setMessages(prev => [...prev, OCTOPUS_SCANNING_MESSAGE]);

    try {
      const data = await octopusApi.preview({ command: text, projectDir });
      completeLeg(1);
      completeLeg(2);

      if (data.success) {
        setMessages(prev => [...prev, octopusMessage(data.preview)]);
        setPendingPlan({ plan: data.plan, command: text, openFilesContext });
        setAwaitingConfirm(true);
      } else {
        setMessages(prev => [...prev, octopusScanErrorMessage(data.error)]);
        resetLegs();
      }
    } catch {
      setMessages(prev => [...prev, OCTOPUS_CONNECT_ERROR_MESSAGE]);
      resetLegs();
    }

    setLoading(false);
  }

  async function executeApprovedPlan() {
    if (!pendingPlan) return;

    const { command, plan, openFilesContext } = pendingPlan;
    setAwaitingConfirm(false);
    setPendingPlan(null);
    setLoading(true);
    resetLegs();

    const currentFile = files.find(file => file.name === activeFile);

    if (plan && plan.tasks) {
      plan.tasks.forEach(task => activateLeg(task.leg, task.task));
    } else {
      activateLeg(1, 'Writing code...');
      activateLeg(2, 'Reviewing...');
    }

    try {
      const data = await octopusApi.parallel({
        command,
        sessionId,
        activeFile,
        activeFileContent: currentFile?.content || '',
        projectContext: openFilesContext,
        projectDir,
        confirmed: true,
        plan,
      });

      getTerminalCommandsFromResponse(data).forEach(queueTerminalCommand);

      if (data.savedFiles && data.savedFiles.length > 0) {
        const lastOpenedFile = await openOctopusSavedFiles({
          currentDir,
          savedFiles: data.savedFiles,
          setFiles,
          setPendingDiffFiles,
        });

        if (lastOpenedFile) setActiveFile(lastOpenedFile);
        if (currentDir) {
          filesApi.list(currentDir).then(fileTreeData => {
            if (fileTreeData.success) setFileTree(fileTreeData.items);
          });
        }
      }

      if (data.success) {
        setTimeout(async () => {
          const code = extractCode(data.result);
          if (code) {
            setFiles(prev => upsertFileByName(prev, activeFile, code));
            if (currentFile?.path) await filesApi.write({ filePath: currentFile.path, content: code });
          }

          legs.forEach(leg => completeLeg(leg.id));
          setMessages(prev => [...prev, octopusMessage(data.result)]);
        }, 800);
      } else {
        setMessages(prev => [...prev, octopusErrorMessage(data.error)]);
        resetLegs();
      }
    } catch {
      setMessages(prev => [...prev, OCTOPUS_CONNECT_ERROR_MESSAGE]);
      resetLegs();
    }

    setLoading(false);
  }

  function cancelPlan() {
    setMessages(prev => [...prev, OCTOPUS_CANCELLED_MESSAGE]);
    setPendingPlan(null);
    setAwaitingConfirm(false);
    resetLegs();
  }

  async function reset() {
    await octopusApi.reset(sessionId);
    setMessages([OCTOPUS_RESET_MESSAGE]);
  }

  return {
    cancelPlan,
    executeApprovedPlan,
    reset,
    send,
  };
}
