const FOLDER_COLORS = {
  app: '#58a6ff', src: '#58a6ff', components: '#79c0ff', config: '#ffa657',
  database: '#ff7b72', routes: '#7ee787', public: '#d2a8ff', resources: '#56d364',
  storage: '#ffa657', tests: '#f778ba', bootstrap: '#ff7b72', lang: '#39d353',
  models: '#79c0ff', controllers: '#58a6ff', views: '#56d364', middleware: '#ffa726',
  providers: '#d2a8ff', mail: '#58a6ff', pages: '#79c0ff', hooks: '#d2a8ff',
  utils: '#ffa657', assets: '#56d364', styles: '#42a5f5', lib: '#ffa657',
};

export function getFolderColor(name) {
  return FOLDER_COLORS[String(name || '').toLowerCase()] || '#e2a14a';
}
