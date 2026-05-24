function createPackageIconResolver({ fetchImpl = fetch, cache = new Map() } = {}) {
  return async function getPackageIcon(packageName) {
    if (!packageName) return null;
    if (cache.has(packageName)) return cache.get(packageName);

    try {
      const reg = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
      const data = await reg.json();

      const homepage = String(data.homepage || '')
        .replace(/^git\+/, '')
        .replace(/\.git$/, '')
        .replace(/^git:\/\//, 'https://')
        .replace(/^git@github.com:/, 'https://github.com/');

      if (homepage.startsWith('http') && !homepage.includes('github.com')) {
        const domain = new URL(homepage).hostname.replace(/^www\./, '');
        if (!['npmjs.com', 'npm.im'].includes(domain)) {
          const icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          cache.set(packageName, icon);
          return icon;
        }
      }

      const repositoryUrl = typeof data.repository === 'string'
        ? data.repository
        : data.repository?.url;
      const bugsUrl = typeof data.bugs === 'string' ? data.bugs : data.bugs?.url;
      const sources = [repositoryUrl, data.homepage, bugsUrl].filter(Boolean).join(' ');
      const githubMatch = sources.match(/github\.com[/:]([^/\s.]+)\/([^/\s.]+)/i);

      if (githubMatch) {
        const icon = `https://avatars.githubusercontent.com/${githubMatch[1]}?s=64`;
        cache.set(packageName, icon);
        return icon;
      }
    } catch {
      // Missing metadata should not break package listing.
    }

    cache.set(packageName, null);
    return null;
  };
}

module.exports = {
  createPackageIconResolver,
};
