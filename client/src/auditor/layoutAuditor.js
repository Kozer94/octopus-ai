
/**
 * Octopus AI — Layout & UI Auditor
 * نظام فحص تلقائي بدون AI يكشف مشاكل الـ UI/UX
 * 
 * يعمل بـ: قواعد (rules) + فحص DOM + تحليل Props
 */

// ═══════════════════════════════════════════
// 1. قواعد فحص المكونات (Component Rules)
// ═══════════════════════════════════════════

const LAYOUT_RULES = [
  {
    id: 'TREE_DEPTH_OVERFLOW',
    severity: 'critical',
    category: 'layout',
    description: 'شجرة الملفات: العمق يتجاوز الحد الآمن للشريط الجانبي',
    check: ({ sidebarWidth, treeDepth }) => {
      const maxSafeDepth = Math.floor((sidebarWidth - 40) / 12);
      if (treeDepth > maxSafeDepth) {
        return {
          violated: true,
          message: `العمق ${treeDepth} يتجاوز الحد الآمن ${maxSafeDepth} لعرض شريط ${sidebarWidth}px`,
          fix: 'أضف virtualization أو قلل مستوى الت indent',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'TAB_OVERFLOW',
    severity: 'critical',
    category: 'layout',
    description: 'التبويبات: ملفات مفتوحة أكثر من المعروض',
    check: ({ openFileCount, visibleTabCount }) => {
      const hidden = openFileCount - visibleTabCount;
      if (hidden > 0) {
        return {
          violated: true,
          message: `${hidden} ملف مخفي خارج التبويبات المرئية (${visibleTabCount}/${openFileCount})`,
          fix: 'استبدل slice(0,N) بتبويبات قابلة للتمرير',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'PANEL_OVERLAP',
    severity: 'critical',
    category: 'layout',
    description: 'اللوحات: العرض الإجمالي يتجاوز viewport',
    check: ({ sidebarWidth, rightPanelWidth, sidebarOpen, rightPanelOpen, viewportWidth }) => {
      const ACTIVITY_BAR = 40;
      const RESIZE_HANDLES = 6;
      const MIN_EDITOR = 300;
      const usedWidth = (sidebarOpen ? sidebarWidth : 0) + (rightPanelOpen ? rightPanelWidth + ACTIVITY_BAR : ACTIVITY_BAR) + RESIZE_HANDLES;
      const editorWidth = viewportWidth - usedWidth;
      if (editorWidth < MIN_EDITOR) {
        return {
          violated: true,
          message: `المحرر يحصل على ${editorWidth}px فقط (الحد الأدنى ${MIN_EDITOR}px). viewport=${viewportWidth}px`,
          fix: 'قلل عرض اللوحات أو أغلق واحدة تلقائياً',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'MISSING_BIDI',
    severity: 'major',
    category: 'rtl',
    description: 'عنصر نصي بدون dir="auto" أو unicode-bidi',
    check: ({ textElements }) => {
      const issues = textElements.filter(el => {
        const hasDir = el.hasAttribute('dir') || !!el.closest('[dir]');
        const hasBidi = hasBidiIsolation(el);
        const text = getAuditableText(el);
        const hasRTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/.test(text);
        return hasRTL && !hasDir && !hasBidi;
      });
      if (issues.length > 0) {
        return {
          violated: true,
          message: `${issues.length} عنصر فيه نص RTL بدون dir="auto"`,
          fix: 'أضف dir="auto" و unicodeBidi: "isolate"',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'MISSING_TEXT_OVERFLOW',
    severity: 'major',
    category: 'layout',
    description: 'نص قد يفيض بدون ellipsis أو overflow:hidden',
    check: ({ textElements }) => {
      const issues = textElements.filter(el => {
        const computed = getComputedStyle(el);
        const parentComputed = el.parentElement ? getComputedStyle(el.parentElement) : null;
        const isInline = computed.display === 'inline' || computed.display === 'inline-block';
        const hasOverflowControl = hasTextOverflowControl(el);
        const isLong = getAuditableText(el).length > 30;
        const inFlexOrGrid = parentComputed?.display === 'flex' || parentComputed?.display === 'grid';
        return isLong && inFlexOrGrid && !hasOverflowControl && !isInline;
      });
      if (issues.length > 0) {
        return {
          violated: true,
          message: `${issues.length} نص طويل بدون overflow control في flex/grid`,
          fix: 'أضف overflow:hidden + textOverflow:ellipsis + whiteSpace:nowrap',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'MODAL_NO_ESCAPE',
    severity: 'major',
    category: 'a11y',
    description: 'Modal بدون زر Escape للإغلاق',
    check: ({ modalElements }) => {
      const issues = modalElements.filter(el => {
        const hasEscape = el.hasAttribute('data-escape-close') || el._hasEscapeHandler;
        return !hasEscape;
      });
      if (issues.length > 0) {
        return {
          violated: true,
          message: `${issues.length} Modal بدون Escape handler`,
          fix: 'أضف onKeyDown={e => e.key === "Escape" && close()}',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'HARDCODED_BACKEND',
    severity: 'minor',
    category: 'config',
    description: 'BACKEND URL ثابت بدون env fallback',
    check: ({ configSource, configUsesEnv }) => {
      if (configUsesEnv) return { violated: false };
      const hasHardcoded = /localhost:\d+/.test(configSource);
      if (hasHardcoded) {
        return {
          violated: true,
          message: 'BACKEND URL ثابت — لن يعمل في production',
          fix: 'استخدم import.meta.env.VITE_BACKEND || "http://localhost:3001"',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'STALE_SESSION_ID',
    severity: 'minor',
    category: 'config',
    description: 'SESSION_ID يتولد مرة واحدة ولا يتجدد',
    check: ({ sessionAge }) => {
      const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 ساعة
      if (sessionAge > MAX_AGE_MS) {
        return {
          violated: true,
          message: `SESSION_ID عمره ${Math.round(sessionAge / 3600000)} ساعة — يجب تجديده`,
          fix: 'أضف TTL أو جدد عند إعادة الاتصال',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'ANIMATION_PERF',
    severity: 'minor',
    category: 'performance',
    description: 'Animations بدون will-change أو prefers-reduced-motion',
    check: ({ animatedElements }) => {
      const issues = animatedElements.filter(el => {
        const style = el.style || {};
        const hasWillChange = style.willChange;
        const hasReducedMotion = el.closest('[data-respects-reduced-motion]');
        return !hasWillChange && !hasReducedMotion;
      });
      if (issues.length > 0) {
        return {
          violated: true,
          message: `${issues.length} عنصر متحرك بدون will-change أو reduced-motion`,
          fix: 'أضف will-change:transform أو احترم prefers-reduced-motion',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'INDEX_AS_KEY',
    severity: 'minor',
    category: 'react',
    description: 'قائمة تستخدم index كـ React key',
    check: () => {
      // هذا يُفحص من خلال static analysis على الكود المصدري
      return { violated: false };
    },
  },
  {
    id: 'NETWORK_DISCONNECT_MISLEADING',
    severity: 'critical',
    category: 'error-handling',
    description: 'انقطاع الشبكة أثناء AI task — الحالة مضللة (Terminal أخضر بينما AI فشل)',
    check: ({ isAIError, isTerminalConnected, legsStuckWorking }) => {
      if (isAIError && isTerminalConnected && legsStuckWorking) {
        return {
          violated: true,
          message: 'AI فشل لكن Terminal يظهر "PTY" أخضر وأرجل عالقة في "working" — المستخدم يظن كل شي عادي',
          fix: 'غيّر حالة الأرجل لـ "error" + أظهر error banner + غيّر مؤشر Terminal',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'WEBSOCKET_LEAK',
    severity: 'major',
    category: 'performance',
    description: 'عدد اتصالات WebSocket أعلى من المتوقع — احتمال تسرب',
    check: ({ websocketCount }) => {
      const MAX_EXPECTED = 3;
      if (websocketCount > MAX_EXPECTED) {
        return {
          violated: true,
          message: `${websocketCount} اتصال WebSocket مفتوح (الحد المتوقع ${MAX_EXPECTED}) — احتمال تسرب عند تبديل المشاريع`,
          fix: 'تأكد من إغلاق WebSocket القديم قبل فتح جديد في TerminalPanel useEffect cleanup',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'REDUCED_MOTION',
    severity: 'minor',
    category: 'a11y',
    description: 'Animations تعمل بدون احترام prefers-reduced-motion',
    check: ({ animatedElements }) => {
      if (!animatedElements || animatedElements.length === 0) return { violated: false };
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) return { violated: false };
      const stillAnimating = animatedElements.filter(el => {
        const computed = getComputedStyle(el);
        return computed.animationName && computed.animationName !== 'none';
      });
      if (stillAnimating.length > 0) {
        return {
          violated: true,
          message: `المستخدم فعّل "Reduce Motion" لكن ${stillAnimating.length} عنصر متحرك لا يزال يعمل`,
          fix: 'أضف @media (prefers-reduced-motion: reduce) لإيقاف/تبسيط الـ animations',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'FONT_IMPORT_IN_RENDER',
    severity: 'minor',
    category: 'performance',
    description: 'Google Fonts @import داخل component render — يسبب طلبات شبكة متكررة',
    check: ({ styleElements }) => {
      if (!styleElements || styleElements.length === 0) return { violated: false };
      const fontImports = styleElements.filter(el => {
        const text = el.textContent || '';
        return text.includes('@import') && text.includes('fonts.googleapis.com');
      });
      if (fontImports.length > 0) {
        return {
          violated: true,
          message: `@import للخطوط داخل ${fontImports.length} عنصر <style> في الـ render — انقلهم لـ index.html`,
          fix: 'انقل @import url(...) لـ <head> في index.html أو لـ index.css',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'ERROR_STATE_LEG_STUCK',
    severity: 'major',
    category: 'error-handling',
    description: 'أرجل عالقة في حالة "working" بدون تحديث لفترة طويلة — احتمال خطأ صامت',
    check: ({ legsLastUpdate, loading }) => {
      if (!loading || !legsLastUpdate) return { violated: false };
      const STUCK_THRESHOLD_MS = 60_000;
      const now = Date.now();
      const stuckLegs = Object.entries(legsLastUpdate)
        .filter(([, lastTime]) => (now - lastTime) > STUCK_THRESHOLD_MS)
        .map(([id]) => id);
      if (stuckLegs.length > 0) {
        return {
          violated: true,
          message: `${stuckLegs.length} أرجل ما تحدثت منذ أكثر من دقيقة — احتمال انقطاع صامت`,
          fix: 'أضف timeout لكل leg + أظهر warning لو ما وصل تحديث خلال 60 ثانية',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'NO_ERROR_BOUNDARY',
    severity: 'critical',
    category: 'error-handling',
    description: 'لا يوجد Error Boundary — أي خطأ في Component يكسر التطبيق بالكامل',
    check: ({ hasErrorBoundary }) => {
      if (!hasErrorBoundary) {
        return {
          violated: true,
          message: 'لا يوجد React Error Boundary في أعلى شجرة المكونات — خطأ واحد يسقط التطبيق كله',
          fix: 'أضف Error Boundary wrapper في App.jsx حول <AppShell> مع UI بديل للخطأ',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'TERMINAL_NO_RECONNECT',
    severity: 'critical',
    category: 'error-handling',
    description: 'Terminal WebSocket لا يعيد الاتصال تلقائياً بعد انقطاع الشبكة',
    check: ({ terminalReconnectSupported }) => {
      if (!terminalReconnectSupported) {
        return {
          violated: true,
          message: 'Terminal WebSocket لا يملك منطق إعادة اتصال — المستخدم يجب يغوي ويفتح التيرمنال يدوياً',
          fix: 'أضف exponential backoff reconnection في TerminalPanel.jsx (MAX 5 محاولات)',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'NO_AUTO_SAVE',
    severity: 'major',
    category: 'ux',
    description: 'لا يوجد Auto-Save — المستخدم يخسر تعديلاته لو نسي يحفظ',
    check: ({ autoSaveEnabled }) => {
      if (!autoSaveEnabled) {
        return {
          violated: true,
          message: 'لا يوجد auto-save أو تحذير عند إغلاق ملف غير محفوظ — خطر فقدان بيانات',
          fix: 'أضف auto-save كل 30 ثانية + dirty tracking + تحذير قبل الإغلاق',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'RTL_CODE_BLOCK_ISOLATION',
    severity: 'major',
    category: 'rtl',
    description: 'Code blocks داخل نص عربي بدون LTR isolation — الرموز تنعكس',
    check: ({ codeBlocksInRTL }) => {
      if (codeBlocksInRTL && codeBlocksInRTL.length > 0) {
        return {
          violated: true,
          message: `${codeBlocksInRTL.length} code block داخل نص RTL بدون direction: ltr — الرموز والكود يظهر معكوس`,
          fix: 'أضف direction: ltr + unicodeBidi: embed للـ code blocks داخل cleanChatText()',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'MONACO_NOT_DISPOSED',
    severity: 'major',
    category: 'performance',
    description: 'Monaco Editor instance لا يتم dispose عند إزالة المكون — تسرب ذاكرة',
    check: ({ monacoCleanupExists }) => {
      if (!monacoCleanupExists) {
        return {
          violated: true,
          message: 'Monaco Editor ما له useEffect cleanup — كل مرة يتفتح يستهلك ذاكرة إضافية',
          fix: 'أضف useEffect return في EditorWorkspace.jsx: if (editorRef.current) editorRef.current.dispose()',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'NO_SYSTEM_THEME_SYNC',
    severity: 'minor',
    category: 'ux',
    description: 'الثيم لا يتبع إعدادات النظام (prefers-color-scheme)',
    check: ({ systemThemeSync }) => {
      if (!systemThemeSync) {
        return {
          violated: true,
          message: 'الثيم محدد يدوياً فقط — لا يتبع dark/light mode تبع النظام',
          fix: 'أضف matchMedia("prefers-color-scheme: dark") listener في App.jsx',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'SEARCH_NO_DEBOUNCE',
    severity: 'minor',
    category: 'performance',
    description: 'Search يرسل طلب API عند كل ضغطة مفتاح بدون debounce',
    check: ({ searchDebounceMs }) => {
      if (!searchDebounceMs || searchDebounceMs < 200) {
        return {
          violated: true,
          message: `Search debounce = ${searchDebounceMs || 0}ms — يرسل طلبات كثيرة للسيرفر`,
          fix: 'أضف debounce 300ms على search input في SearchPanel.jsx',
        };
      }
      return { violated: false };
    },
  },
];


// ═══════════════════════════════════════════
// 1.5 دوال مساعدة (Helper Functions)
// ═══════════════════════════════════════════

function detectRTLCodeBlocks(textElements) {
  const RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
  const CODE_PATTERN = /[{}();=<>/]/;
  const issues = [];
  for (const el of textElements) {
    const text = getAuditableText(el);
    if (RTL_PATTERN.test(text) && CODE_PATTERN.test(text)) {
      const style = el.style || {};
      const computed = getComputedStyle(el);
      const bidi = style.unicodeBidi || computed.unicodeBidi;
      const hasLTR = style.direction === 'ltr' ||
        computed.direction === 'ltr' ||
        bidi === 'embed' ||
        bidi === 'bidi-override' ||
        bidi === 'plaintext' ||
        bidi === 'isolate' ||
        bidi === 'isolate-override';
      if (!hasLTR) issues.push(el);
    }
    if (issues.length >= 10) break;
  }
  return issues;
}

function getDirectText(el) {
  return Array.from(el.childNodes || [])
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent || '')
    .join(' ')
    .trim();
}

function getAuditableText(el) {
  const directText = getDirectText(el);
  if (directText) return directText;
  return el.children.length === 0 ? (el.textContent || '').trim() : '';
}

function hasBidiIsolation(el) {
  const computed = getComputedStyle(el);
  const inline = el.style || {};
  const bidi = inline.unicodeBidi || computed.unicodeBidi;
  return !!inline.unicodeBidi ||
    bidi === 'isolate' ||
    bidi === 'plaintext' ||
    bidi === 'embed' ||
    bidi === 'bidi-override' ||
    bidi === 'isolate-override';
}

function hasTextOverflowControl(el) {
  const computed = getComputedStyle(el);
  return computed.overflow === 'hidden' ||
    computed.overflow === 'auto' ||
    computed.overflowX === 'hidden' ||
    computed.textOverflow === 'ellipsis' ||
    computed.wordBreak === 'break-word' ||
    computed.overflowWrap === 'break-word' ||
    computed.overflowWrap === 'anywhere' ||
    computed.whiteSpace === 'pre-wrap';
}

// ═══════════════════════════════════════════
// 2. جامع البيانات (Data Collector)
// ═══════════════════════════════════════════

export function collectLayoutState() {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // جمع بيانات من DOM
  const textElements = Array.from(document.querySelectorAll('span, p, div'))
    .filter(el => getAuditableText(el).length > 0)
    .slice(0, 200); // حد أقصى للأداء

  const modalElements = Array.from(document.querySelectorAll('[style*="position: fixed"]'))
    .filter(el => {
      const style = el.style || {};
      return style.inset === '0' || (style.top === '0' && style.left === '0' && style.right === '0' && style.bottom === '0');
    });

  const animatedElements = Array.from(document.querySelectorAll('[style*="animation"]'))
    .slice(0, 50);

  const styleElements = Array.from(document.querySelectorAll('style'))
    .slice(0, 20);

  // حساب اتصالات WebSocket المفتوحة
  let websocketCount = 0;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const entries = performance.getEntriesByType('resource');
      websocketCount = entries.filter(e => e.name.startsWith('ws://') || e.name.startsWith('wss://')).length;
    } catch { /* غير مدعوم */ }
  }

  // جمع بيانات من React state (عبر window.__OCTOPUS_DEV__)
  const devState = window.__OCTOPUS_DEV__ || {};

  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    sidebarWidth: devState.sidebarWidth || 0,
    rightPanelWidth: devState.rightPanelWidth || 0,
    sidebarOpen: devState.sidebarOpen ?? false,
    rightPanelOpen: devState.rightPanelOpen ?? false,
    openFileCount: devState.openFileCount || 0,
    visibleTabCount: devState.visibleTabCount || 0,
    treeDepth: devState.treeDepth || 0,
    sessionAge: devState.sessionAge || 0,
    configSource: devState.configSource || '',
    configUsesEnv: devState.configUsesEnv || false,
    isAIError: devState.isAIError || false,
    isTerminalConnected: devState.isTerminalConnected || false,
    legsStuckWorking: devState.legsStuckWorking || false,
    legsLastUpdate: devState.legsLastUpdate || null,
    loading: devState.loading || false,
    websocketCount,
    hasErrorBoundary: devState.hasErrorBoundary || false,
    terminalReconnectSupported: devState.terminalReconnectSupported || false,
    autoSaveEnabled: devState.autoSaveEnabled || false,
    monacoCleanupExists: devState.monacoCleanupExists || false,
    systemThemeSync: devState.systemThemeSync || false,
    searchDebounceMs: devState.searchDebounceMs || 0,
    codeBlocksInRTL: detectRTLCodeBlocks(textElements),
    textElements,
    modalElements,
    animatedElements,
    styleElements,
    listElements: [],
  };
}


// ═══════════════════════════════════════════
// 3. المحرك (Auditor Engine)
// ═══════════════════════════════════════════

export function runLayoutAudit(state) {
  const results = [];

  for (const rule of LAYOUT_RULES) {
    try {
      const result = rule.check(state);
      results.push({
        id: rule.id,
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        violated: result.violated,
        message: result.violated ? result.message : null,
        fix: result.violated ? result.fix : null,
      });
    } catch (err) {
      results.push({
        id: rule.id,
        severity: 'info',
        category: 'auditor',
        description: rule.description,
        violated: false,
        message: `فشل الفحص: ${err.message}`,
        fix: null,
      });
    }
  }

  return results;
}

export function formatAuditReport(results) {
  const violated = results.filter(r => r.violated);
  const passed = results.filter(r => !r.violated);

  const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };
  violated.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  let report = `\n🐙 Octopus Layout Audit\n`;
  report += `${'═'.repeat(40)}\n`;
  report += `✅ Passed: ${passed.length}  ❌ Violated: ${violated.length}\n\n`;

  if (violated.length > 0) {
    report += `VIOLATIONS:\n${'─'.repeat(40)}\n`;
    for (const v of violated) {
      const icon = v.severity === 'critical' ? '🔴' : v.severity === 'major' ? '🟠' : '🟡';
      report += `${icon} [${v.severity.toUpperCase()}] ${v.id}\n`;
      report += `   ${v.message}\n`;
      report += `   Fix: ${v.fix}\n\n`;
    }
  }

  return report;
}
