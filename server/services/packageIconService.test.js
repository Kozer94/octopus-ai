const test = require('node:test');
const assert = require('node:assert/strict');
const { createPackageIconResolver } = require('./packageIconService');

test('createPackageIconResolver resolves non-github homepage favicons', async () => {
  const getPackageIcon = createPackageIconResolver({
    fetchImpl: async () => ({
      async json() {
        return { homepage: 'https://vite.dev' };
      },
    }),
  });

  assert.equal(await getPackageIcon('vite'), 'https://www.google.com/s2/favicons?domain=vite.dev&sz=64');
});

test('createPackageIconResolver resolves github owner avatars', async () => {
  const getPackageIcon = createPackageIconResolver({
    fetchImpl: async () => ({
      async json() {
        return { repository: { url: 'git+https://github.com/facebook/react.git' } };
      },
    }),
  });

  assert.equal(await getPackageIcon('react'), 'https://avatars.githubusercontent.com/facebook?s=64');
});

test('createPackageIconResolver caches null failures', async () => {
  let calls = 0;
  const getPackageIcon = createPackageIconResolver({
    fetchImpl: async () => {
      calls++;
      throw new Error('network');
    },
  });

  assert.equal(await getPackageIcon('missing'), null);
  assert.equal(await getPackageIcon('missing'), null);
  assert.equal(calls, 1);
});
