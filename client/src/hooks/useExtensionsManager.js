import { useState } from 'react';
import { extensionsApi } from '../services/apiClient';

export function useExtensionsManager() {
  const [extSearchQuery, setExtSearchQuery] = useState('');
  const [extSearchResults, setExtSearchResults] = useState([]);
  const [extSearching, setExtSearching] = useState(false);
  const [installedExtensions, setInstalledExtensions] = useState([]);
  const [selectedExtension, setSelectedExtension] = useState(null);

  async function searchExtensions(query) {
    if (!query.trim()) {
      setExtSearchResults([]);
      return;
    }
    setExtSearching(true);
    try {
      const data = await extensionsApi.search(query);
      setExtSearchResults(data.extensions || []);
    } catch (error) {
      console.error('Failed to search extensions:', error);
      setExtSearchResults([]);
    }
    setExtSearching(false);
  }

  async function installExtension(extension) {
    try {
      const data = await extensionsApi.install(extension);
      if (data.success) {
        setInstalledExtensions(prev => [...prev, extension]);
      }
    } catch (error) {
      console.error('Failed to install extension:', error);
    }
  }

  async function uninstallExtension(extensionId) {
    try {
      const data = await extensionsApi.uninstall(extensionId);
      if (data.success) {
        setInstalledExtensions(prev => prev.filter(ext => ext.id !== extensionId));
      }
    } catch (error) {
      console.error('Failed to uninstall extension:', error);
    }
  }

  function isExtensionInstalled(extensionId) {
    return installedExtensions.some(ext => ext.id === extensionId);
  }

  return {
    extSearchQuery,
    extSearchResults,
    extSearching,
    installExtension,
    installedExtensions,
    isExtensionInstalled,
    searchExtensions,
    selectedExtension,
    setExtSearchQuery,
    setSelectedExtension,
    uninstallExtension,
  };
}
