const fs = require('fs');
const path = require('path');

class ProjectStats {
  constructor() {
    this.id = 'project-stats';
    this.name = 'إحصائيات المشروع';
    this.version = '1.0.0';
    this.description = 'يحسب إحصائيات الملفات (سطور، كلمات، حجم) عند فتحها';
    this.author = 'Octopus Team';
    this.icon = '📊';
    this.enabled = true;

    this.hooks = {
      onFileOpen: async (data) => {
        try {
          const { filePath, content } = data;
          if (!filePath || !content) return data;

          const lines = content.split('\n').length;
          const words = content.split(/\s+/).filter(w => w.length > 0).length;
          const size = Buffer.byteLength(content, 'utf8');

          console.log(`📊 File stats: ${filePath} - ${lines} lines, ${words} words, ${size} bytes`);

          return { ...data, stats: { lines, words, size } };
        } catch (error) {
          console.error('Project-stats error:', error.message);
          return data;
        }
      }
    };

    this.routes = [
      {
        method: 'GET',
        path: '/api/plugin/project-stats/stats',
        handler: async (req, res) => {
          try {
            const { dir } = req.query;
            if (!dir) {
              return res.status(400).json({ success: false, error: 'dir parameter required' });
            }

            const stats = {
              totalFiles: 0,
              totalLines: 0,
              totalWords: 0,
              totalSize: 0,
              byExtension: {}
            };

            function scanDirectory(currentDir) {
              const items = fs.readdirSync(currentDir);

              for (const item of items) {
                const itemPath = path.join(currentDir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                  if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(item)) {
                    scanDirectory(itemPath);
                  }
                } else if (stat.isFile()) {
                  try {
                    const content = fs.readFileSync(itemPath, 'utf8');
                    const lines = content.split('\n').length;
                    const words = content.split(/\s+/).filter(w => w.length > 0).length;
                    const size = stat.size;
                    const ext = path.extname(item).toLowerCase() || 'no-ext';

                    stats.totalFiles++;
                    stats.totalLines += lines;
                    stats.totalWords += words;
                    stats.totalSize += size;

                    if (!stats.byExtension[ext]) {
                      stats.byExtension[ext] = { files: 0, lines: 0, words: 0, size: 0 };
                    }
                    stats.byExtension[ext].files++;
                    stats.byExtension[ext].lines += lines;
                    stats.byExtension[ext].words += words;
                    stats.byExtension[ext].size += size;
                  } catch (error) {
                    // skip unreadable files
                  }
                }
              }
            }

            scanDirectory(dir);

            res.json({ success: true, stats });
          } catch (error) {
            res.status(500).json({ success: false, error: error.message });
          }
        }
      }
    ];
  }

  async initialize() {
    console.log('ProjectStats plugin initialized');
  }
}

module.exports = ProjectStats;
