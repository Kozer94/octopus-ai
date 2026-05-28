// ChatPanel.jsx — لوحة الدردشة الكاملة (رسائل + إدخال)
// مستخرج من RightPanel.jsx

import { useState } from 'react';
import { ChatInput }    from './ChatInput';
import { ChatMessages } from './ChatMessages';
import { LivePreview }  from '../preview/LivePreview';
import { getDefaultModelId } from '../../services/ModelRegistry';
import '../preview/LivePreview.css';

// ─── دوال مساعدة ─────────────────────────────────────────────────────────────

function composeChatCommand(text, mode) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (mode === 'inquiry')  return `[Mode: Inquiry]\n${trimmed}`;
  if (mode === 'fix')      return `[Mode: Fix]\n${trimmed}`;
  if (mode === 'explain')  return `[Mode: Explain]\n${trimmed}`;
  if (mode === 'refactor') return `[Mode: Refactor]\n${trimmed}`;
  if (mode === 'test')     return `[Mode: Test]\n${trimmed}`;
  return trimmed;
}

// خوێندنەوەی فایلەکانی باسکراو لە پەیامدا
function extractMentionedFileContext(text, files) {
  if (!files?.length) return '';
  const fileNameRe = /\b[\w.-]+\.[\w]{1,10}\b/g;
  const mentions   = [...new Set(text.match(fileNameRe) || [])];
  const contexts   = [];
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

/**
 * ChatPanel — اللوحة الكاملة للدردشة مع AI
 *
 * Props:
 *   awaitingConfirm     boolean
 *   bottomRef           ref
 *   cancelPlan          fn
 *   currentDir          string  — مسار المشروع (لكتابة الملفات من كتل <file>)
 *   executeApprovedPlan fn
 *   files               array
 *   input               string
 *   loading             boolean
 *   messages            array
 *   send                fn(command, model)
 *   setInput            fn(val)
 *   t                   object — theme
 */
export function ChatPanel({
  awaitingConfirm,
  bottomRef,
  cancelPlan,
  currentDir,
  executeApprovedPlan,
  files,
  input,
  loading,
  messages,
  send,
  setInput,
  t,
}) {
  const [chatMode,      setChatMode]      = useState('build');
  const [selectedModel, setSelectedModel] = useState(getDefaultModelId);
  const [showPreview,   setShowPreview]   = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');

  // تحضير الأمر وإرساله
  const sendChatMessage = () => {
    const command = composeChatCommand(input, chatMode);
    if (!command) return;
    const fileContext = extractMentionedFileContext(input, files);
    const fullCommand = fileContext ? `${command}${fileContext}` : command;
    send(fullCommand, selectedModel);
  };

  return (
    <div className="chat-panel-container">
      <div className={`chat-panel-content ${showPreview ? 'with-preview' : ''}`}>
        <div className="chat-panel-main">
          <div className="chat-panel-header">
            <h3>💬 Chat</h3>
            <button 
              onClick={() => setShowPreview(!showPreview)}
              className="preview-toggle-btn"
              title={showPreview ? 'Hide Preview' : 'Show Preview'}
            >
              {showPreview ? '🖥️ Hide Preview' : '🖥️ Show Preview'}
            </button>
          </div>
          <ChatMessages
            awaitingConfirm={awaitingConfirm}
            bottomRef={bottomRef}
            cancelPlan={cancelPlan}
            currentDir={currentDir}
            executeApprovedPlan={executeApprovedPlan}
            messages={messages}
            onTerminalOutput={setTerminalOutput}
            t={t}
          />
          <ChatInput
            chatMode={chatMode}
            input={input}
            loading={loading}
            onModeChange={setChatMode}
            onModelChange={setSelectedModel}
            onSend={sendChatMessage}
            selectedModel={selectedModel}
            setInput={setInput}
            t={t}
          />
        </div>
        {showPreview && (
          <div className="chat-panel-preview">
            <LivePreview
              terminalOutput={terminalOutput}
              isVisible={showPreview}
              onClose={() => setShowPreview(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
