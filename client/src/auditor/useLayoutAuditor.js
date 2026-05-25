
import { useCallback, useEffect, useRef, useState } from 'react';
import { collectLayoutState, formatAuditReport, runLayoutAudit } from './layoutAuditor';

const isDevelopment = import.meta.env?.MODE === 'development';

/**
 * Hook يربط نظام الفحص بـ React
 * 
 * الاستخدام:
 *   const audit = useLayoutAuditor({ sidebarWidth, rightPanelWidth, ... });
 *   audit.run();      // فحص يدوي
 *   audit.results;    // النتائج
 *   audit.report;     // تقرير نصي
 */
export function useLayoutAuditor(layoutState) {
  const [results, setResults] = useState([]);
  const [lastRun, setLastRun] = useState(null);
  const autoIntervalRef = useRef(null);

  // تسجيل حالة التطوير لجمع البيانات من DOM
  useEffect(() => {
    window.__OCTOPUS_DEV__ = {
      ...window.__OCTOPUS_DEV__,
      ...layoutState,
      sessionAge: layoutState.sessionStartedAt ? Date.now() - layoutState.sessionStartedAt : 0,
      isAIError: layoutState.isAIError || false,
      isTerminalConnected: layoutState.isTerminalConnected || false,
      legsStuckWorking: layoutState.legsStuckWorking || false,
      legsLastUpdate: layoutState.legsLastUpdate || null,
      loading: layoutState.loading || false,
      hasErrorBoundary: layoutState.hasErrorBoundary || false,
      terminalReconnectSupported: layoutState.terminalReconnectSupported || false,
      autoSaveEnabled: layoutState.autoSaveEnabled || false,
      monacoCleanupExists: layoutState.monacoCleanupExists || false,
      systemThemeSync: layoutState.systemThemeSync || false,
      searchDebounceMs: layoutState.searchDebounceMs || 0,
      configUsesEnv: layoutState.configUsesEnv || false,
    };
    return () => { delete window.__OCTOPUS_DEV__; };
  }, [layoutState]);

  const run = useCallback(() => {
    const state = collectLayoutState();
    const auditResults = runLayoutAudit(state);
    setResults(auditResults);
    setLastRun(Date.now());

    if (isDevelopment) {
      const report = formatAuditReport(auditResults);
      const violated = auditResults.filter(r => r.violated);
      if (violated.length > 0) {
        console.warn(report);
      } else {
        console.log(report);
      }
    }

    return auditResults;
  }, []);

  // فحص تلقائي كل 5 ثواني (development فقط)
  useEffect(() => {
    if (!isDevelopment) return;

    autoIntervalRef.current = setInterval(() => {
      run();
    }, 5000);

    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    };
  }, [run]);

  // فحص عند تغيير حجم النافذة
  useEffect(() => {
    if (!isDevelopment) return;

    const onResize = () => { run(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [run]);

  const violatedCount = results.filter(r => r.violated).length;
  const criticalCount = results.filter(r => r.violated && r.severity === 'critical').length;

  return {
    results,
    lastRun,
    run,
    report: formatAuditReport(results),
    violatedCount,
    criticalCount,
    hasIssues: violatedCount > 0,
  };
}
