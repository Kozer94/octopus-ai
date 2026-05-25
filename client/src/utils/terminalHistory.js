export const TERMINAL_READY_ENTRY = { type: 'system', text: '🐙 Terminal ready' };

export function terminalInputEntry(command) {
  return { type: 'input', text: `$ ${command}` };
}

export function terminalResultEntry(data) {
  return {
    type: data.success ? 'output' : 'error',
    text: data.output || data.error || '',
  };
}

export function terminalOutputEntry(text) {
  return { type: 'output', text };
}

export function terminalStreamingEntry(text = '') {
  return { type: 'output', text, streaming: true };
}

export function appendTerminalOutputChunk(history, chunk) {
  if (!chunk) return history;
  const last = history.at(-1);

  if (last?.streaming) {
    return [...history.slice(0, -1), { ...last, text: `${last.text}${chunk}` }];
  }

  return [...history, terminalStreamingEntry(chunk)];
}

export function finishTerminalStream(history) {
  const last = history.at(-1);
  if (!last?.streaming) return history;
  return [...history.slice(0, -1), { type: last.type, text: last.text }];
}

export function terminalErrorEntry(message) {
  return { type: 'error', text: `⚠️ ${message}` };
}

export function terminalPlainErrorEntry(text) {
  return { type: 'error', text };
}

export function terminalSystemEntry(text) {
  return { type: 'system', text };
}

export function terminalRunEntry(command) {
  return terminalSystemEntry(`🚀 Running: ${command}`);
}

export function terminalApprovalEntry(command) {
  return terminalSystemEntry(`Approval required: ${command}`);
}

export function terminalSkippedEntry(command) {
  return terminalSystemEntry(`Skipped: ${command}`);
}

export function terminalExitEntry(code) {
  return terminalSystemEntry(`Process exited with code ${code}`);
}
