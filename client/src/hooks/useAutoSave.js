
import { useCallback, useEffect, useRef } from 'react';
import { filesApi } from '../services/apiClient';

/**
 * Auto-Save Hook
 * - يحفظ تلقائياً كل 30 ثانية
 * - يتتبع الملفات المتسخة (dirty)
 * - يُحذّر عند إغلاق ملف غير محفوظ
 */
export function useAutoSave({
  currentDir,
  files,
  setFiles,
  activeFile,
  setActiveFile,
  addOctopusMessage,
}) {
  const AUTO_SAVE_INTERVAL_MS = 30_000;
  const lastSavedContentRef = useRef(new Map());
  const autoSaveTimerRef = useRef(null);

  // تحديد الملفات المتسخة
  const getDirtyFiles = useCallback(() => {
    return files.filter(f => {
      if (!f.path || f.content === undefined) return false;
      const lastSaved = lastSavedContentRef.current.get(f.path);
      return lastSaved !== undefined ? f.content !== lastSaved : false;
    });
  }, [files]);

  const isFileDirty = useCallback((fileName) => {
    const file = files.find(f => f.name === fileName);
    if (!file?.path || file.content === undefined) return false;
    const lastSaved = lastSavedContentRef.current.get(file.path);
    return lastSaved !== undefined ? file.content !== lastSaved : false;
  }, [files]);

  // حفظ ملف واحد
  const saveFile = useCallback(async (file) => {
    if (!file?.path || file.content === undefined) return false;
    try {
      await filesApi.write({ filePath: file.path, content: file.content, projectDir: currentDir });
      lastSavedContentRef.current.set(file.path, file.content);
      return true;
    } catch {
      return false;
    }
  }, [currentDir]);

  // حفظ كل الملفات المتسخة
  const autoSave = useCallback(async () => {
    const dirtyFiles = getDirtyFiles();
    if (dirtyFiles.length === 0) return;

    let savedCount = 0;
    for (const file of dirtyFiles) {
      const ok = await saveFile(file);
      if (ok) savedCount++;
    }

    if (savedCount > 0 && addOctopusMessage) {
      addOctopusMessage(`Auto-saved ${savedCount} file${savedCount > 1 ? 's' : ''}`);
    }
  }, [getDirtyFiles, saveFile, addOctopusMessage]);

  // تشغيل auto-save كل 30 ثانية
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(autoSave, AUTO_SAVE_INTERVAL_MS);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [autoSave]);

  // تسجيل المحتوى عند فتح ملف جديد (للتتبع)
  useEffect(() => {
    for (const file of files) {
      if (file.path && file.content !== undefined && !lastSavedContentRef.current.has(file.path)) {
        lastSavedContentRef.current.set(file.path, file.content);
      }
    }
  }, [files]);

  // تحذير قبل إغلاق ملف متسخ
  const confirmCloseFile = useCallback((fileName) => {
    if (isFileDirty(fileName)) {
      const file = files.find(f => f.name === fileName);
      const name = file?.name || fileName;
      return window.confirm(`"${name}" has unsaved changes. Close anyway?`);
    }
    return true;
  }, [isFileDirty, files]);

  // إغلاق ملف مع تحقق
  const closeFileWithConfirm = useCallback((fileName) => {
    if (!confirmCloseFile(fileName)) return false;

    const remaining = files.filter(f => f.name !== fileName);
    setFiles(remaining);
    if (activeFile === fileName) {
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].name : '');
    }

    // حذف من التتبع
    const file = files.find(f => f.name === fileName);
    if (file?.path) lastSavedContentRef.current.delete(file.path);

    return true;
  }, [files, setFiles, activeFile, setActiveFile, confirmCloseFile]);

  // تحذير قبل إغلاق النافذة
  useEffect(() => {
    const handler = (e) => {
      if (getDirtyFiles().length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [getDirtyFiles]);

  return {
    autoSave,
    closeFileWithConfirm,
    confirmCloseFile,
    getDirtyFiles,
    isFileDirty,
    saveFile,
  };
}
