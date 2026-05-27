
import { useCallback, useEffect, useRef, useState } from 'react';
import { runDomAudit } from './domAuditRules';
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
  const hudChannelRef = useRef(null);
  const latestHudPayloadRef = useRef(null);
  const reportSignatureRef = useRef('');

  useEffect(() => {
    if (!isDevelopment || typeof BroadcastChannel === 'undefined') return;

    try {
      const channel = new BroadcastChannel('octopus-audit-hud');
      hudChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'audit-request' && latestHudPayloadRef.current) {
          channel.postMessage({ type: 'audit-update', payload: latestHudPayloadRef.current });
        }
        if (event.data?.type === 'css-patch-apply' && typeof event.data.code === 'string') {
          const style = document.createElement('style');
          style.id = `oct-hud-patch-${Date.now()}`;
          style.textContent = event.data.code;
          document.head.appendChild(style);
          window.__OCTOPUS_LAST_PATCH__ = {
            ...(event.data.patch || {}),
            status: 'applied',
            source: 'app-runtime',
            changed: true,
            code: event.data.code,
            styleId: style.id,
            message: 'Patch preview style was injected into the app document.',
            at: new Date().toISOString(),
          };
        }
        if (event.data?.type === 'dom-audit-request') {
          const domAudit = runDomAudit({ autoFix: event.data.autoFix === true });
          const payload = {
            ...domAudit,
            lastRun: Date.now(),
            lastScan: new Date().toLocaleTimeString(),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };

          try {
            localStorage.setItem('octopus-dom-audit-hud', JSON.stringify(payload));
          } catch { /* ignore HUD persistence failures */ }

          channel.postMessage({ type: 'dom-audit-update', payload });
        }
      };

      return () => {
        channel.close();
        if (hudChannelRef.current === channel) hudChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, []);

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
    const scanTime = Date.now();
    setResults(auditResults);
    setLastRun(scanTime);

    if (isDevelopment) {
      const report = formatAuditReport(auditResults);
      const violated = auditResults.filter(r => r.violated);
      const critical = violated.filter(r => r.severity === 'critical').length;
      const major = violated.filter(r => r.severity === 'major').length;
      const minor = violated.filter(r => r.severity === 'minor').length;
      const reportSignature = JSON.stringify(violated.map(result => ({
        id: result.id,
        severity: result.severity,
        message: result.message,
      })));

      const hudPayload = {
        results: auditResults,
        lastRun: scanTime,
        lastScan: new Date(scanTime).toLocaleTimeString(),
        passed: auditResults.length - violated.length,
        critical,
        major,
        minor,
        viewportWidth: state.viewportWidth,
        viewportHeight: state.viewportHeight,
      };
      latestHudPayloadRef.current = hudPayload;

      try {
        localStorage.setItem('octopus-audit-hud', JSON.stringify(hudPayload));
        hudChannelRef.current?.postMessage({ type: 'audit-update', payload: hudPayload });
      } catch { /* ignore HUD persistence failures */ }

      if (reportSignature !== reportSignatureRef.current) {
        reportSignatureRef.current = reportSignature;
        if (violated.length > 0) {
          console.warn(report);
        } else {
          console.log(report);
        }
      }
    }

    return auditResults;
  }, []);

  // فحص تلقائي كل 5 ثواني (development فقط)
  useEffect(() => {
    if (!isDevelopment) return;

    const initialRunTimer = setTimeout(run, 0);
    autoIntervalRef.current = setInterval(() => {
      run();
    }, 5000);

    return () => {
      clearTimeout(initialRunTimer);
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
