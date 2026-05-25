import { useState } from 'react';
import { workspaceApi } from '../services/apiClient';

export function useWorkspaceSearch({ currentDir }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function doSearch(q) {
    if (!q.trim() || !currentDir) return;
    setSearching(true);
    try {
      const data = await workspaceApi.search({ query: q, dirPath: currentDir });
      if (data.success) setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults([]);
  }

  return {
    clearSearch,
    doSearch,
    searchQuery,
    searchResults,
    searching,
    setSearchQuery,
  };
}
