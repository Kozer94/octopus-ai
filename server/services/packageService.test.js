const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackageService, extractVsixArchive, readVsixManifest } = require('./packageService');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-packages-'));
}

function makeStoredZip(entryName, content) {
  return makeStoredZipEntries([{ name: entryName, content }]);
}

function makeStoredZipEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.content);
  const localHeader = Buffer.alloc(30 + name.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);
  name.copy(localHeader, 30);
    localParts.push(localHeader, data);

  const centralHeader = Buffer.alloc(46 + name.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt32LE(0, 12);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt32LE(0, 34);
  centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
  name.copy(centralHeader, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

test('installExtension downloads VSIX and persists extension metadata', async () => {
  const rootDir = makeTempRoot();
  const installedNpmPackages = {};
  let saveCount = 0;
  const originalFetch = global.fetch;
  const manifest = JSON.stringify({
    name: 'demo',
    displayName: 'Demo Extension',
    version: '1.2.3',
    description: 'Real manifest',
    contributes: {
      commands: [{ command: 'demo.run', title: 'Run Demo' }],
      themes: [{ label: 'Demo Theme', uiTheme: 'vs-dark', path: './themes/demo.json' }],
    },
  });
  const zip = makeStoredZip('extension/package.json', manifest);
  global.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
  });

  try {
    const packages = createPackageService({
      getPackageIcon: async () => null,
      installedNpmPackages,
      saveNpmPackages: () => { saveCount += 1; },
      rootDir,
    });

    const result = await packages.installExtension({
      extension: {
        id: 'Publisher.demo',
        namespace: 'Publisher',
        name: 'demo',
        displayName: 'Demo Extension',
        version: '1.2.3',
        files: { download: 'https://open-vsx.org/api/Publisher/demo/1.2.3/file/demo.vsix' },
      },
    });

    assert.equal(result.extension.id, 'Publisher.demo');
    assert.equal(result.extension.installType, 'vsix-download');
    assert.equal(result.extension.activationStatus, 'downloaded-not-activated');
    assert.deepEqual(result.extension.capabilities, [
      { type: 'commands', count: 1 },
      { type: 'themes', count: 1 },
    ]);
    assert.equal(result.extension.manifest.displayName, 'Demo Extension');
    assert.equal(fs.existsSync(path.join(rootDir, result.extension.extractedPath, 'package.json')), true);
    assert.equal(saveCount, 1);
    assert.equal(fs.existsSync(path.join(rootDir, result.extension.localPath)), true);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('extractVsixArchive expands extension files safely', async () => {
  const rootDir = makeTempRoot();
  const destination = path.join(rootDir, 'extracted');
  const zip = makeStoredZipEntries([
    { name: 'extension/package.json', content: '{"name":"demo"}' },
    { name: 'extension/dist/extension.js', content: 'module.exports = {};' },
  ]);

  try {
    await extractVsixArchive(zip, destination);

    assert.equal(fs.existsSync(path.join(destination, 'package.json')), true);
    assert.equal(fs.existsSync(path.join(destination, 'dist', 'extension.js')), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('installLocalVsix persists uploaded VSIX metadata and extracted files', async () => {
  const rootDir = makeTempRoot();
  const installedNpmPackages = {};
  let saveCount = 0;
  const zip = makeStoredZipEntries([
    { name: 'extension/package.json', content: JSON.stringify({
      name: 'local-demo',
      publisher: 'LocalPub',
      displayName: 'Local Demo',
      version: '0.1.0',
      contributes: {
        commands: [{ command: 'localDemo.run', title: 'Run Local Demo' }],
      },
    }) },
    { name: 'extension/dist/extension.js', content: 'module.exports = {};' },
  ]);

  try {
    const packages = createPackageService({
      getPackageIcon: async () => null,
      installedNpmPackages,
      saveNpmPackages: () => { saveCount += 1; },
      rootDir,
    });

    const result = await packages.installLocalVsix({
      bytes: zip,
      fileName: 'local-demo.vsix',
    });

    assert.equal(result.extension.id, 'LocalPub.local-demo');
    assert.equal(result.extension.installType, 'local-vsix-upload');
    assert.equal(result.extension.manifest.displayName, 'Local Demo');
    assert.deepEqual(result.extension.capabilities, [{ type: 'commands', count: 1 }]);
    assert.equal(fs.existsSync(path.join(rootDir, result.extension.localPath)), true);
    assert.equal(fs.existsSync(path.join(rootDir, result.extension.extractedPath, 'dist', 'extension.js')), true);
    assert.equal(saveCount, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('readVsixManifest extracts extension package metadata from VSIX', () => {
  const zip = makeStoredZip('extension/package.json', JSON.stringify({
    name: 'demo',
    displayName: 'Demo Extension',
    contributes: {
      languages: [{ id: 'demo', extensions: ['.demo'] }],
    },
  }));

  const manifest = readVsixManifest(zip);

  assert.equal(manifest.name, 'demo');
  assert.equal(manifest.displayName, 'Demo Extension');
  assert.equal(manifest.contributes.languages[0].id, 'demo');
});

test('uninstallExtension removes downloaded VSIX and installed record', async () => {
  const rootDir = makeTempRoot();
  const installDir = path.join(rootDir, 'server', 'state', 'extensions', 'Publisher.demo');
  fs.mkdirSync(installDir, { recursive: true });
  const localPath = 'server/state/extensions/Publisher.demo/demo-1.2.3.vsix';
  fs.writeFileSync(path.join(rootDir, localPath), 'vsix bytes');

  const installedNpmPackages = {
    'Publisher.demo': {
      id: 'Publisher.demo',
      namespace: 'Publisher',
      name: 'demo',
      source: 'vsx',
      localPath,
    },
  };
  let saveCount = 0;

  try {
    const packages = createPackageService({
      getPackageIcon: async () => null,
      installedNpmPackages,
      saveNpmPackages: () => { saveCount += 1; },
      rootDir,
    });

    await packages.uninstallExtension({ extensionId: 'Publisher.demo' });

    assert.equal(installedNpmPackages['Publisher.demo'], undefined);
    assert.equal(fs.existsSync(path.join(rootDir, localPath)), false);
    assert.equal(saveCount, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
