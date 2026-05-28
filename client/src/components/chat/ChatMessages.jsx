// ChatMessages.jsx — قائمة رسائل الدردشة
// يُحلَّل كل رسالة من Octopus إلى أجزاء نص + terminal + file
// ويعرض ChatTerminalBlock و ChatMonacoBlock مضمّنَيْن داخل فقاعة الرسالة

import { useState } from 'react';
import { cleanChatText }      from '../../utils/diffUtils';
import { bidiPlainTextStyle } from '../../utils/bidiText';
import { parseMessageParts }  from '../../utils/parseMessageParts';
import { filesApi }           from '../../services/apiClient';
import { ChatTerminalBlock }  from './ChatTerminalBlock';
import { ChatMonacoBlock }    from './ChatMonacoBlock';

// ─── مفاتيح الرسائل ──────────────────────────────────────────────────────────
function getMessageKey(message) {
  return message.id || `${message.role}:${message.at || ''}:${message.text?.slice(0, 80) || ''}`;
}

// ─── تنظيف النص لكتلة text (بعد استخراج terminal/file) ──────────────────────
function cleanTextPart(raw) {
  return cleanChatText(raw || '');
}

// ─── زر Apply All / Cancel على مستوى الرسالة ────────────────────────────────

function MessageFileBar({ fileBlocks, currentDir, onDone, t }) {
  const [working,  setWorking]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleApplyAll = async () => {
    if (working || done) return;
    setWorking(true);
    setErrorMsg('');
    try {
      await Promise.all(
        fileBlocks.map(fb =>
          filesApi.write({ filePath: fb.path, content: fb.code, projectDir: currentDir }),
        ),
      );
      setDone(true);
      onDone?.('applied');
    } catch (err) {
      setErrorMsg(err.message || 'Write failed');
      setWorking(false);
    }
  };

  const handleCancel = () => {
    onDone?.('cancelled');
  };

  if (done) return null;

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        8,
      marginTop:  10,
      padding:    '8px 10px',
      background: t.bg,
      border:     `0.5px solid ${t.border}`,
      borderRadius: 7,
    }}>
      <i className="codicon codicon-files" style={{ fontSize: 12, color: t.textMuted }} />
      <span style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>
        {fileBlocks.length} file{fileBlocks.length > 1 ? 's' : ''} ready to apply
      </span>

      {errorMsg && (
        <span style={{ fontSize: 10, color: '#ff7b72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
          ⚠ {errorMsg}
        </span>
      )}

      <button
        onClick={handleApplyAll}
        disabled={working}
        style={{
          background:   working ? t.border : '#238636',
          border:       'none',
          borderRadius: 5,
          color:        working ? t.textMuted : '#fff',
          padding:      '4px 12px',
          fontSize:     11,
          cursor:       working ? 'not-allowed' : 'pointer',
          fontWeight:   500,
          fontFamily:   'Inter, system-ui, sans-serif',
        }}
      >
        {working ? '…' : '✅ Apply All'}
      </button>

      <button
        onClick={handleCancel}
        style={{
          background:   t.border,
          border:       'none',
          borderRadius: 5,
          color:        t.text,
          padding:      '4px 10px',
          fontSize:     11,
          cursor:       'pointer',
          fontFamily:   'Inter, system-ui, sans-serif',
        }}
      >
        ❌ Cancel
      </button>
    </div>
  );
}

// ─── عرض رسالة Octopus (مُحلَّلة إلى أجزاء) ─────────────────────────────────

function OctopusMessageContent({ message, currentDir, onTerminalOutput, t }) {
  const rawText = message.text || '';
  const parts   = parseMessageParts(rawText);
  const fileBlocks = parts.filter(p => p.type === 'file');

  // حالة Bar: null | 'applied' | 'cancelled'
  const [barState, setBarState] = useState(null);

  // النص الكامل المنظّف (للـ Copy)
  const cleanFull = cleanChatText(rawText);

  return (
    <>
      {parts.map((part, idx) => {
        // ── كتلة نص ──────────────────────────────────────────────────────────
        if (part.type === 'text') {
          const clean = cleanTextPart(part.content);
          if (!clean) return null;
          return (
            <p
              key={idx}
              dir="auto"
              style={bidiPlainTextStyle({
                fontSize:   13,
                color:      t.text,
                margin:     0,
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak:  'break-word',
              })}
            >
              {clean}
            </p>
          );
        }

        // ── كتلة terminal ─────────────────────────────────────────────────────
        if (part.type === 'terminal') {
          return (
            <ChatTerminalBlock
              key={idx}
              command={part.command}
              currentDir={currentDir}
              onOutput={typeof onTerminalOutput === 'function' ? onTerminalOutput : undefined}
              t={t}
            />
          );
        }

        // ── كتلة file ─────────────────────────────────────────────────────────
        if (part.type === 'file') {
          // إخفاء الكتلة بعد Apply All أو Cancel
          if (barState === 'cancelled') return null;

          return (
            <ChatMonacoBlock
              key={idx}
              path={part.path}
              code={part.code}
              currentDir={currentDir}
              t={t}
            />
          );
        }

        return null;
      })}

      {/* ── شريط Apply All / Cancel (يظهر فقط إذا في الرسالة ملفات ولم تُعالَج) */}
      {fileBlocks.length > 0 && barState === null && (
        <MessageFileBar
          fileBlocks={fileBlocks}
          currentDir={currentDir}
          onDone={setBarState}
          t={t}
        />
      )}

      {/* ── زر Copy ──────────────────────────────────────────────────────────── */}
      <button
        onClick={() => navigator.clipboard?.writeText(cleanFull)}
        style={{
          marginTop:  6,
          background: 'transparent',
          border:     'none',
          color:      t.textMuted,
          cursor:     'pointer',
          fontSize:   11,
          padding:    0,
          display:    'flex',
          alignItems: 'center',
          gap:        4,
        }}
      >
        <i className="codicon codicon-copy" style={{ fontSize: 11 }} />
        Copy
      </button>
    </>
  );
}

// ─── Export رئيسي ─────────────────────────────────────────────────────────────

/**
 * ChatMessages — عرض الرسائل + كتل terminal/file + أزرار الموافقة على الخطة
 *
 * Props:
 *   awaitingConfirm     boolean
 *   bottomRef           ref
 *   cancelPlan          fn
 *   currentDir          string  — مسار المشروع (لكتابة الملفات)
 *   executeApprovedPlan fn
 *   messages            array
 *   t                   object — theme
 */
export function ChatMessages({
  awaitingConfirm,
  bottomRef,
  cancelPlan,
  centerMode = false,
  currentDir,
  executeApprovedPlan,
  messages,
  onTerminalOutput,
  t,
}) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      background: t.bg,
      padding: centerMode ? '28px 18px 40px' : '16px 12px',
    }}>
      <div style={{ maxWidth: centerMode ? 700 : 'none', margin: centerMode ? '0 auto' : 0 }}>
        {messages.map(message => {
          const isOctopus = message.role === 'octopus';

          const displayText = isOctopus ? null : message.text;

          return (
            <div
              key={getMessageKey(message)}
              style={{
                marginBottom: centerMode ? 22 : 20,
                display: 'flex',
                justifyContent: isOctopus ? 'flex-start' : 'flex-end',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexDirection: isOctopus ? 'row' : 'row-reverse',
                gap: 10,
                maxWidth: isOctopus ? '100%' : '82%',
                minWidth: 0,
              }}>

                {/* ── أيقونة المرسل ──────────────────────────────────────────── */}
                <div style={{
                  width:           28,
                  height:          28,
                  borderRadius:    '50%',
                  background:      isOctopus ? t.accent + '22' : t.border,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  fontSize:        14,
                  flexShrink:      0,
                }}>
                  {isOctopus
                    ? '🐙'
                    : <i className="codicon codicon-account" style={{ fontSize: 14, color: t.textMuted }} />
                  }
                </div>

                {/* ── محتوى الرسالة ──────────────────────────────────────────── */}
                <div style={{
                  minWidth: 0,
                  maxWidth: '100%',
                  background: isOctopus ? 'transparent' : t.accent + '18',
                  border: isOctopus ? 'none' : `0.5px solid ${t.accent}33`,
                  borderRadius: isOctopus ? 0 : 10,
                  padding: isOctopus ? 0 : '9px 12px',
                }}>
                  {/* اسم المرسل */}
                  <span style={{
                    fontSize:    11,
                    fontWeight:  600,
                    color:       isOctopus ? t.accent : t.textMuted,
                    marginBottom: 4,
                    display:     'block',
                    textAlign:   isOctopus ? 'left' : 'right',
                  }}>
                    {isOctopus ? 'Octopus' : 'You'}
                  </span>

                  {/* المحتوى */}
                  {isOctopus
                    ? (
                      <OctopusMessageContent
                        message={message}
                        currentDir={currentDir}
                        onTerminalOutput={onTerminalOutput}
                        t={t}
                      />
                    )
                    : (
                      <p
                        dir="auto"
                        style={bidiPlainTextStyle({
                          fontSize:   13,
                          color:      t.text,
                          margin:     0,
                          lineHeight: 1.65,
                          whiteSpace: 'pre-wrap',
                          wordBreak:  'break-word',
                        })}
                      >
                        {displayText}
                      </p>
                    )
                  }
                </div>
              </div>
            </div>
          );
        })}

        {/* ── أزرار الموافقة على الخطة ─────────────────────────────────────── */}
        {awaitingConfirm && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, justifyContent: centerMode ? 'center' : 'flex-start' }}>
            <button
              style={{
                background:   '#238636',
                border:       'none',
                borderRadius: 6,
                color:        '#fff',
                padding:      '7px 16px',
                fontSize:     12,
                cursor:       'pointer',
                fontWeight:   500,
              }}
              onClick={executeApprovedPlan}
            >
              ✅ Approve
            </button>
            <button
              style={{
                background:   t.border,
                border:       'none',
                borderRadius: 6,
                color:        t.text,
                padding:      '7px 16px',
                fontSize:     12,
                cursor:       'pointer',
              }}
              onClick={cancelPlan}
            >
              ❌ Cancel
            </button>
          </div>
        )}

        {/* مرجع التمرير التلقائي */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
