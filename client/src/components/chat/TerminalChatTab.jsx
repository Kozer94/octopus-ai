import { useState } from 'react';
import { getDefaultModelId } from '../../services/ModelRegistry';
import { ChatInput } from './ChatInput';
import { analyzeTerminalCommandRisk } from '../../utils/terminalRisk';

function composeChatCommand(text, mode) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (mode === 'inquiry') return `[Mode: Inquiry]\n${trimmed}`;
  if (mode === 'fix') return `[Mode: Fix]\n${trimmed}`;
  if (mode === 'explain') return `[Mode: Explain]\n${trimmed}`;
  if (mode === 'refactor') return `[Mode: Refactor]\n${trimmed}`;
  if (mode === 'test') return `[Mode: Test]\n${trimmed}`;
  return trimmed;
}

function extractMentionedFileContext(text, files) {
  if (!files?.length) return '';
  const fileNameRe = /\b[\w.-]+\.[\w]{1,10}\b/g;
  const mentions = [...new Set(text.match(fileNameRe) || [])];
  const contexts = [];
  for (const mention of mentions) {
    const file = files.find(f =>
      f.name === mention
      || f.path?.endsWith('/' + mention)
      || f.path?.endsWith('\\' + mention)
      || f.path === mention,
    );
    if (file?.content) {
      contexts.push(`\n\n--- File: ${mention} ---\n${file.content.slice(0, 3000)}\n--- End of ${mention} ---`);
    }
  }
  return contexts.join('');
}

function TerminalCommandApproval({ command, onApprove, onReject, t }) {
  if (!command) return null;
  const risk = analyzeTerminalCommandRisk(command);
  const isHighRisk = risk.level === 'destructive';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
      alignItems: 'start',
      gap: 8,
      padding: '8px 10px',
      borderBottom: `0.5px solid ${t.border}`,
      background: t.sidebar,
      flexShrink: 0,
    }}>
      <i className="codicon codicon-terminal" style={{ color: risk.color, fontSize: 13, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: risk.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{risk.label}</span>
          <code dir="auto" style={{
            minWidth: 0,
            color: t.text,
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {command}
          </code>
        </div>
        <p style={{ color: t.textMuted, fontSize: 10.5, lineHeight: 1.35, marginTop: 3 }}>{risk.message}</p>
      </div>
      <button
        onClick={() => onApprove?.(command)}
        style={{
          background: isHighRisk ? '#da3633' : '#238636',
          border: 'none',
          borderRadius: 5,
          color: '#fff',
          cursor: 'pointer',
          fontSize: 11,
          padding: '5px 10px',
        }}
      >
        {isHighRisk ? 'Confirm' : 'Run'}
      </button>
      <button
        onClick={onReject}
        style={{
          background: t.border,
          border: 'none',
          borderRadius: 5,
          color: t.text,
          cursor: 'pointer',
          fontSize: 11,
          padding: '5px 10px',
        }}
      >
        Skip
      </button>
    </div>
  );
}

export function TerminalChatTab({
  files,
  input,
  loading,
  onApproveTerminal,
  onRejectTerminal,
  selectedModel,
  send,
  setInput,
  setSelectedModel,
  t,
  terminalCommand,
}) {
  const [chatMode, setChatMode] = useState('build');
  const model = selectedModel || getDefaultModelId();

  const sendChatMessage = () => {
    const command = composeChatCommand(input, chatMode);
    if (!command) return;
    const fileContext = extractMentionedFileContext(input, files);
    const fullCommand = fileContext ? `${command}${fileContext}` : command;
    send(fullCommand, model);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg }}>
      <TerminalCommandApproval
        command={terminalCommand}
        onApprove={onApproveTerminal}
        onReject={onRejectTerminal}
        t={t}
      />
      <div style={{ flex: 1, minHeight: 0 }} />
      <ChatInput
        chatMode={chatMode}
        input={input}
        loading={loading}
        onModeChange={setChatMode}
        onModelChange={setSelectedModel}
        onSend={sendChatMessage}
        selectedModel={model}
        setInput={setInput}
        t={t}
      />
    </div>
  );
}
