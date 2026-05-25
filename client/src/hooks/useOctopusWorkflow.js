import { useEffect, useRef } from 'react';
import { octopusApi } from '../services/apiClient';
import { openOctopusSavedFiles } from '../services/octopusSavedFiles';
import {
  OCTOPUS_BUSY_MESSAGE,
  OCTOPUS_CANCELLED_MESSAGE,
  OCTOPUS_CONNECT_ERROR_MESSAGE,
  OCTOPUS_RESET_MESSAGE,
  OCTOPUS_SCANNING_MESSAGE,
  OCTOPUS_SLOW_MESSAGE,
  OCTOPUS_TIMEOUT_MESSAGE,
  octopusErrorMessage,
  octopusMessage,
  octopusRateLimitMessage,
  octopusScanErrorMessage,
  userMessage,
} from '../utils/chatMessages';
import { extractCode } from '../utils/diffUtils';
import { buildOpenFilesContext, isComplexOctopusTask } from '../utils/octopusPromptContext';
import { getTerminalCommandsFromResponse } from '../utils/octopusResponse';
import { applyLegUpdates } from '../utils/legState';
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
  setLegs,
  setMessages,
  setPendingDiffFiles,
  setPendingPlan,
  setWorkflowError = () => {},
}) {
  const legUpdateQueueRef = useRef([]);
  const legUpdateFrameRef = useRef(null);
  const streamingMessageRef = useRef(null);
  const streamChunkRef = useRef(null);

  function scheduleLegUpdateFlush() {
    if (legUpdateFrameRef.current) return;
    const scheduleFrame = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 16));
    legUpdateFrameRef.current = scheduleFrame(() => {
      legUpdateFrameRef.current = null;
      flushQueuedLegUpdates();
    });
  }

  function flushQueuedLegUpdates() {
    const updates = legUpdateQueueRef.current;
    if (!updates.length) return;
    legUpdateQueueRef.current = [];
    setLegs(prev => applyLegUpdates(prev, updates));
  }

  function cancelQueuedLegUpdates() {
    if (legUpdateFrameRef.current) {
      const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;
      cancelFrame(legUpdateFrameRef.current);
      legUpdateFrameRef.current = null;
    }
    legUpdateQueueRef.current = [];
  }

  function queueLegUpdate(entry) {
    if (!entry?.legId) return;
    legUpdateQueueRef.current.push(entry);
    scheduleLegUpdateFlush();
  }

  function clearWorkflowError() {
    setWorkflowError(null);
  }

  function reportWorkflowError(message, detail = '') {
    const userFriendlyMessage = getUserFriendlyErrorMessage(message);
    setWorkflowError({
      message: userFriendlyMessage,
      detail,
      at: new Date().toISOString(),
    });
  }

  function getUserFriendlyErrorMessage(technicalMessage) {
    if (technicalMessage?.includes('rate limited') || technicalMessage?.includes('429')) {
      return 'AI service is busy. Please wait a moment and try again.';
    }
    if (technicalMessage?.includes('timeout') || technicalMessage?.includes('timed out') || technicalMessage?.includes('انتهت المهلة')) {
      return 'Request took too long. The AI service may be slow. Try again.';
    }
    if (technicalMessage?.includes('no key') || technicalMessage?.includes('API key')) {
      return 'AI service is not configured. Please check your API keys in settings.';
    }
    if (technicalMessage?.includes('network') || technicalMessage?.includes('connection') || technicalMessage?.includes('Could not connect')) {
      return 'Cannot connect to AI service. Please check your internet connection.';
    }
    if (technicalMessage?.includes('payload too large') || technicalMessage?.includes('too large')) {
      return 'Request is too large. Try breaking it into smaller tasks.';
    }
    return technicalMessage || 'An unexpected error occurred. Please try again.';
  }

  useEffect(() => () => {
    if (legUpdateFrameRef.current) {
      const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;
      cancelFrame(legUpdateFrameRef.current);
    }
    legUpdateQueueRef.current = [];
    legUpdateFrameRef.current = null;
    streamingMessageRef.current = null;
    streamChunkRef.current = null;
  }, []);

  function flushStreamChunk() {
    if (!streamChunkRef.current || !streamChunkRef.current.length) return;
    const chunk = streamChunkRef.current;
    streamChunkRef.current = '';
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === 'octopus' && streamingMessageRef.current === lastMsg) {
        return [...prev.slice(0, -1), { ...lastMsg, text: lastMsg.text + chunk }];
      }
      return [...prev, octopusMessage(chunk)];
    });
  }

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
    clearWorkflowError();
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
          reportWorkflowError(data.error || 'Octopus request failed', 'Simple AI request returned an error.');
          setMessages(prev => [...prev, octopusErrorMessage(data.error)]);
          resetLegs();
        }
      } catch (err) {
        reportWorkflowError(err?.message || 'Could not connect to server.', 'Simple AI request failed before completion.');
        setMessages(prev => [...prev, err?.rateLimited ? octopusRateLimitMessage(err.resetAt) : OCTOPUS_CONNECT_ERROR_MESSAGE]);
        resetLegs();
      }

      setLoading(false);
      return;
    }

    activateLeg(1, 'Scanning project...');
    activateLeg(2, 'Planning tasks...');
    setMessages(prev => [...prev, OCTOPUS_SCANNING_MESSAGE]);

    const slowTimer = setTimeout(() => {
      setMessages(prev => [...prev, OCTOPUS_SLOW_MESSAGE]);
    }, 30_000);

    try {
      const data = await octopusApi.preview({ command: text, projectDir });
      clearTimeout(slowTimer);
      completeLeg(1);
      completeLeg(2);

      if (data.success) {
        setMessages(prev => [...prev, octopusMessage(data.preview)]);
        setPendingPlan({ plan: data.plan, command: text, openFilesContext });
        setAwaitingConfirm(true);
      } else {
        reportWorkflowError(data.error || 'Project scan failed', 'Preview planning returned an error response.');
        setMessages(prev => [...prev, octopusScanErrorMessage(data.error)]);
        resetLegs();
      }
    } catch (err) {
      clearTimeout(slowTimer);
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timed out') || err?.message?.includes('انتهت المهلة');
      reportWorkflowError(
        isTimeout ? 'Project scan timed out.' : (err?.message || 'Could not connect to server.'),
        'Preview planning failed before completion.',
      );
      setMessages(prev => [...prev,
        err?.rateLimited ? octopusRateLimitMessage(err.resetAt)
          : isTimeout ? OCTOPUS_TIMEOUT_MESSAGE
            : OCTOPUS_CONNECT_ERROR_MESSAGE,
      ]);
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
    clearWorkflowError();
    resetLegs();

    const currentFile = files.find(file => file.name === activeFile);

    if (plan && Array.isArray(plan.tasks)) {
      plan.tasks.forEach(task => activateLeg(task.leg, task.task));
    } else {
      activateLeg(1, 'Writing code...');
      activateLeg(2, 'Reviewing...');
    }

    const slowTimer = setTimeout(() => {
      setMessages(prev => [...prev, OCTOPUS_SLOW_MESSAGE]);
    }, 30_000);

    try {
      streamChunkRef.current = '';
      streamingMessageRef.current = null;

      const data = await octopusApi.parallelStream({
        command,
        sessionId,
        activeFile,
        activeFileContent: currentFile?.content || '',
        projectContext: openFilesContext,
        projectDir,
        confirmed: true,
        plan,
      }, {
        onMessage: (entry, eventName) => {
          if (eventName === 'leg_update' && entry?.legId) {
            queueLegUpdate(entry);
          } else if (eventName === 'chunk' && entry?.text) {
            const CHUNK_SIZE = 500;
            if (!streamChunkRef.current) streamChunkRef.current = '';
            streamChunkRef.current += entry.text;
            if (streamChunkRef.current.length >= CHUNK_SIZE) {
              flushStreamChunk();
            }
          }
        },
      });

      clearTimeout(slowTimer);
      flushStreamChunk();
      flushQueuedLegUpdates();
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
        streamChunkRef.current = '';
        streamingMessageRef.current = null;
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
        reportWorkflowError(data.error || 'Parallel execution failed', 'Parallel stream completed with an error response.');
        setMessages(prev => [...prev, octopusErrorMessage(data.error)]);
        resetLegs();
      }
    } catch (err) {
      clearTimeout(slowTimer);
      cancelQueuedLegUpdates();
      flushStreamChunk();
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timed out') || err?.message?.includes('انتهت المهلة');
      reportWorkflowError(
        isTimeout ? 'AI stream timed out before completion.' : (err?.message || 'AI stream disconnected before completion.'),
        'Leg state was reset. Review connection or provider status before retrying.',
      );
      setMessages(prev => [...prev,
        err?.rateLimited ? octopusRateLimitMessage(err.resetAt)
          : isTimeout ? OCTOPUS_TIMEOUT_MESSAGE
            : OCTOPUS_CONNECT_ERROR_MESSAGE,
      ]);
      resetLegs();
    }

    setLoading(false);
  }

  function cancelPlan() {
    setMessages(prev => [...prev, OCTOPUS_CANCELLED_MESSAGE]);
    clearWorkflowError();
    setPendingPlan(null);
    setAwaitingConfirm(false);
    resetLegs();
  }

  async function reset() {
    await octopusApi.reset(sessionId);
    clearWorkflowError();
    setMessages([OCTOPUS_RESET_MESSAGE]);
  }

  return {
    cancelPlan,
    executeApprovedPlan,
    reset,
    send,
  };
}
