
import { useCallback, useEffect, useRef } from 'react';
import { filesApi } from '../services/apiClient';
import { getOpenFileId, isOpenFileActive } from '../utils/openFileIdentity';

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

  const isFileDirty = useCallback((fileId) => {
    const file = files.find(f => getOpenFileId(f) === fileId || f.name === fileId);
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
  const confirmCloseFile = useCallback((fileId) => {
    if (isFileDirty(fileId)) {
      const file = files.find(f => getOpenFileId(f) === fileId || f.name === fileId);
      const name = file?.name || fileId;
      return window.confirm(`"${name}" has unsaved changes. Close anyway?`);
    }
    return true;
  }, [isFileDirty, files]);

  // إغلاق ملف مع تحقق
  const closeFileWithConfirm = useCallback((fileId) => {
    if (!confirmCloseFile(fileId)) return false;

    const remaining = files.filter(f => getOpenFileId(f) !== fileId && f.name !== fileId);
    setFiles(remaining);
    if (activeFile === fileId || files.some(file => isOpenFileActive(file, activeFile) && (getOpenFileId(file) === fileId || file.name === fileId))) {
      setActiveFile(getOpenFileId(remaining[remaining.length - 1]));
    }

    // حذف من التتبع
    const file = files.find(f => getOpenFileId(f) === fileId || f.name === fileId);
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
