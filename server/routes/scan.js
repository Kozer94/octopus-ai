const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');
const { scanProject, generateReport } = require('../services/scanService');

function registerScanRoutes(app) {
  app.post('/api/scan', async (req, res) => {
    try {
      const { projectDir } = req.body;
      if (!projectDir) return res.status(400).json({ success: false, error: 'projectDir is required' });

      // تحقق الأمان
      if (!fs.existsSync(projectDir)) {
        return res.status(400).json({ success: false, error: 'المجلد غير موجود: ' + projectDir });
      }

      const scan   = scanProject(projectDir);
      const report = generateReport(scan);

      // كتابة report.md
      const reportPath = path.join(projectDir, 'report.md');
      await fsp.writeFile(reportPath, report, 'utf8');

      res.json({
        success: true,
        report,
        reportPath,
        stats: {
          totalFiles:  scan.totalFiles,
          totalLines:  scan.totalLines,
          totalSizeKB: Math.round(scan.totalSize / 1024),
          frameworks:  scan.frameworks,
          routesFound: scan.routes.length,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

module.exports = { registerScanRoutes };
