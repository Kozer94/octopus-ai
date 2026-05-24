export function getFolderName(folderPath = '') {
  return folderPath.split('\\').pop() || folderPath.split('/').pop() || folderPath;
}

export function addRecentProject(projects, project) {
  const exists = projects.find(item => item.path === project.path);
  if (exists) return projects;

  return [...projects, project];
}
