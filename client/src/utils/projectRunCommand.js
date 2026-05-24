export function detectRunCommand(fileTree = []) {
  const fileNames = fileTree.map(file => file.name);

  if (fileNames.includes('artisan')) return 'php artisan serve';
  if (fileNames.includes('manage.py')) return 'python manage.py runserver';

  return 'npm run dev';
}
