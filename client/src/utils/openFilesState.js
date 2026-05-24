export function upsertOpenedFile(files, item, content) {
  const exists = files.find(file => file.path === item.path);
  if (exists) {
    return files.map(file => file.path === item.path ? { ...file, content } : file);
  }

  return [...files, { ...item, content }];
}

export function upsertFileByName(files, name, content) {
  const exists = files.find(file => file.name === name);
  if (exists) {
    return files.map(file => file.name === name ? { ...file, content } : file);
  }

  return [...files, { name, content }];
}

export function upsertFileByPathOrName(files, { name, path, content }) {
  const exists = files.find(file => file.path === path || file.name === name);
  if (exists) {
    return files.map(file =>
      file.path === path || file.name === name
        ? { ...file, name, path, content }
        : file
    );
  }

  return [...files, { name, path, content }];
}

export function upsertAcceptedDiffFile(files, file, fileName) {
  const exists = files.find(openFile => openFile.path === file.path || openFile.name === fileName);
  if (exists) {
    return files.map(openFile =>
      openFile.path === file.path || openFile.name === fileName
        ? { ...openFile, name: fileName, path: file.path, content: file.newContent }
        : openFile
    );
  }

  return [...files, { name: fileName, path: file.path, content: file.newContent }];
}
