import { filesApi } from './apiClient';
import { getSavedFileDisplayName, getSavedFileReadPath, splitSavedFiles } from '../utils/octopusResponse';
import { upsertFileByPathOrName } from '../utils/openFilesState';

export async function openOctopusSavedFiles({ currentDir, savedFiles, setFiles, setPendingDiffFiles }) {
  if (!savedFiles || savedFiles.length === 0) return null;

  let lastOpenedFile = null;
  const { filesForReview, filesToOpen } = splitSavedFiles(savedFiles);

  if (filesForReview.length > 0) {
    setPendingDiffFiles(prev => [...prev, ...filesForReview]);
  }

  for (const file of filesToOpen) {
    const readPath = getSavedFileReadPath(file);
    const fileData = await filesApi.read({ filePath: readPath, projectDir: currentDir });

    if (fileData.success) {
      const fileName = getSavedFileDisplayName(file, readPath);
      setFiles(prev => upsertFileByPathOrName(prev, { name: fileName, path: file.path, content: fileData.content }));
      lastOpenedFile = fileName;
    }
  }

  return lastOpenedFile;
}
