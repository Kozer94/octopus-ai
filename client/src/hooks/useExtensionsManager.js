import { useEffect, useRef, useState } from 'react';
import { extensionsApi } from '../services/apiClient';

function getExtensionKeys(extension = {}) {
  return [
    extension.id,
    extension.name,
    extension.namespace && extension.name ? `${extension.namespace}.${extension.name}` : '',
    extension.publisher && extension.name ? `${extension.publisher}.${extension.name}` : '',
  ]
    .filter(Boolean)
    .map(key => String(key).toLowerCase());
}

function extensionsMatch(left = {}, right = {}) {
  const leftKeys = new Set(getExtensionKeys(left));
  return getExtensionKeys(right).some(key => leftKeys.has(key));
}

let installedExtensionsCache = null;
let installedExtensionsPromise = null;

function loadInstalledExtensionsOnce() {
  if (installedExtensionsCache) {
    return Promise.resolve({ success: true, extensions: installedExtensionsCache });
  }
  if (!installedExtensionsPromise) {
    installedExtensionsPromise = extensionsApi.list()
      .then(data => {
        if (data.success) installedExtensionsCache = data.extensions || [];
        return data;
      })
      .finally(() => {
        installedExtensionsPromise = null;
      });
  }
  return installedExtensionsPromise;
}

export function useExtensionsManager({ onActivationFailed } = {}) {
  const [extSearchQuery, setExtSearchQuery] = useState('');
  const [extSearchResults, setExtSearchResults] = useState([]);
  const [extSearching, setExtSearching] = useState(false);
  const [installedExtensions, setInstalledExtensions] = useState([]);
  const [selectedExtension, setSelectedExtension] = useState(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadInstalledExtensionsOnce()
      .then(data => {
        if (!cancelled && data.success) setInstalledExtensions(data.extensions || []);
      })
      .catch(error => {
        if (!error?.rateLimited) console.error('Failed to load installed extensions:', error);
      });
    return () => { cancelled = true; };
  }, []);

  async function searchExtensions(query) {
    if (!query.trim()) {
      setExtSearchResults([]);
      return;
    }
    setExtSearching(true);
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    try {
      const data = await extensionsApi.search(query);
      if (requestId !== searchRequestRef.current) return;
      setExtSearchResults(data.extensions || []);
    } catch (error) {
      if (!error?.rateLimited) console.error('Failed to search extensions:', error);
      if (requestId !== searchRequestRef.current) return;
      setExtSearchResults([]);
    }
    if (requestId === searchRequestRef.current) setExtSearching(false);
  }

  async function installExtension(extension) {
    try {
      const data = await extensionsApi.install(extension);
      if (data.success) {
        const installed = data.extension || extension;
        setInstalledExtensions(prev => {
          const next = [
            ...prev.filter(ext => !extensionsMatch(ext, installed)),
            installed,
          ];
          installedExtensionsCache = next;
          return next;
        });
        setExtSearchResults(prev => prev.map(ext => extensionsMatch(ext, installed) ? { ...ext, ...installed } : ext));
        setSelectedExtension(prev => extensionsMatch(prev, extension) ? { ...prev, ...installed } : prev);
      }
    } catch (error) {
      console.error('Failed to install extension:', error);
    }
  }

  async function installLocalVsix(file) {
    try {
      const data = await extensionsApi.installLocalVsix(file);
      if (data.success) {
        const installed = data.extension;
        setInstalledExtensions(prev => {
          const next = [
            ...prev.filter(ext => !extensionsMatch(ext, installed)),
            installed,
          ];
          installedExtensionsCache = next;
          return next;
        });
        setExtSearchResults(prev => prev.map(ext => extensionsMatch(ext, installed) ? { ...ext, ...installed } : ext));
        setSelectedExtension(installed);
      }
      return data;
    } catch (error) {
      console.error('Failed to install local VSIX:', error);
      return { success: false, error: error.message };
    }
  }

  async function uninstallExtension(extensionId) {
    try {
      const data = await extensionsApi.uninstall(extensionId);
      if (data.success) {
        const target = { id: extensionId };
        setInstalledExtensions(prev => {
          const next = prev.filter(ext => !extensionsMatch(ext, target));
          installedExtensionsCache = next;
          return next;
        });
        setExtSearchResults(prev => prev.map(ext => extensionsMatch(ext, target)
          ? { ...ext, activationStatus: '', localPath: '', capabilities: [] }
          : ext));
        setSelectedExtension(prev => extensionsMatch(prev, target) ? { ...prev, activationStatus: '', localPath: '', capabilities: [] } : prev);
      }
    } catch (error) {
      console.error('Failed to uninstall extension:', error);
    }
  }

  async function activateExtension(extensionId) {
    try {
      const data = await extensionsApi.activate(extensionId);
      if (data.success) {
        const status = data.status || {};
        const runtimePatch = {
          activationStatus: status.activationStatus,
          runtimeStatus: status.runtimeStatus,
        };
        const target = { id: extensionId };
        setInstalledExtensions(prev => prev.map(ext => extensionsMatch(ext, target) ? { ...ext, ...runtimePatch } : ext));
        setExtSearchResults(prev => prev.map(ext => extensionsMatch(ext, target) ? { ...ext, ...runtimePatch } : ext));
        setSelectedExtension(prev => extensionsMatch(prev, target) ? { ...prev, ...runtimePatch } : prev);
        if (status.runtimeStatus?.state === 'failed') {
          onActivationFailed?.({ extensionId, status });
        }
      }
    } catch (error) {
      console.error('Failed to activate extension:', error);
    }
  }

  async function deactivateExtension(extensionId) {
    try {
      const data = await extensionsApi.deactivate(extensionId);
      if (data.success) {
        const status = data.status || {};
        const runtimePatch = {
          activationStatus: status.activationStatus,
          runtimeStatus: status.runtimeStatus,
        };
        const target = { id: extensionId };
        setInstalledExtensions(prev => prev.map(ext => extensionsMatch(ext, target) ? { ...ext, ...runtimePatch } : ext));
        setExtSearchResults(prev => prev.map(ext => extensionsMatch(ext, target) ? { ...ext, ...runtimePatch } : ext));
        setSelectedExtension(prev => extensionsMatch(prev, target) ? { ...prev, ...runtimePatch } : prev);
      }
    } catch (error) {
      console.error('Failed to deactivate extension:', error);
    }
  }

  function isExtensionInstalled(extensionId) {
    return installedExtensions.some(ext => extensionsMatch(ext, { id: extensionId }));
  }

  return {
    extSearchQuery,
    extSearchResults,
    extSearching,
    activateExtension,
    deactivateExtension,
    installExtension,
    installLocalVsix,
    installedExtensions,
    isExtensionInstalled,
    searchExtensions,
    selectedExtension,
    setExtSearchQuery,
    setSelectedExtension,
    uninstallExtension,
  };
}
