const fs = require('fs');
const path = require('path');

class AutoSave {
  constructor() {
    this.id = 'auto-save';
    this.name = 'الحفظ التلقائي';
    this.version = '1.0.0';
    this.description = 'يحفظ نسخة احتياطية من كل ملف يتم حفظه في مجلد .backups';
    this.author = 'Octopus Team';
    this.icon = '💾';
    this.enabled = true;

    this.hooks = {
      onFileSave: async (data) => {
        try {
          const { filePath, content, projectDir } = data;
          if (!filePath || !content || !projectDir) return data;

          const backupsDir = path.join(projectDir, '.backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }

          const fileName = path.basename(filePath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupFileName = `${fileName}.${timestamp}.backup`;
          const backupPath = path.join(backupsDir, backupFileName);

          fs.writeFileSync(backupPath, content, 'utf8');
          console.log(`💾 Backup created: ${backupPath}`);

          return data;
        } catch (error) {
          console.error('Auto-save error:', error.message);
          return data;
        }
      }
    };

    this.routes = [
      {
        method: 'GET',
        path: '/api/plugin/auto-save/backups',
        handler: async (req, res) => {
          try {
            const { projectDir } = req.query;
            if (!projectDir) {
              return res.status(400).json({ success: false, error: 'projectDir required' });
            }

            const backupsDir = path.join(projectDir, '.backups');
            if (!fs.existsSync(backupsDir)) {
              return res.json({ success: true, backups: [] });
            }

            const files = fs.readdirSync(backupsDir)
              .filter(f => f.endsWith('.backup'))
              .map(f => {
                const filePath = path.join(backupsDir, f);
                const stats = fs.statSync(filePath);
                return {
                  name: f,
                  path: filePath,
                  size: stats.size,
                  created: stats.birthtime,
                  modified: stats.mtime
                };
              })
              .sort((a, b) => b.created - a.created);

            res.json({ success: true, backups: files });
          } catch (error) {
            res.status(500).json({ success: false, error: error.message });
          }
        }
      }
    ];
  }

  async initialize() {
    console.log('AutoSave plugin initialized');
  }
}

module.exports = AutoSave;
