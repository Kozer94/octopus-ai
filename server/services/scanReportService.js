function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function issueIcon(level) {
  return ({ error: '🔴', warning: '🟡', info: '🔵', ok: '🟢' }[level] || '⚪');
}

function severityIcon(label) {
  return ({ critical: '🔴', major: '🟠', moderate: '🟡', minor: '🔵' }[label] || '⚪');
}

function formatSeverity(issue) {
  const severity = issue.severity;
  if (!severity) return '';
  const d = severity.dimensions;
  return [
    `- **Severity Engine**: ${severityIcon(severity.label)} **${severity.label.toUpperCase()}** (${severity.score}/100, confidence ${severity.confidence}%)`,
    `- **Exploitability**: ${d.exploitability}%`,
    `- **User impact**: ${d.userImpact}%`,
    `- **Reproducibility**: ${d.reproducibility}%`,
    `- **Production risk**: ${d.productionRisk}%`,
  ].join('\n');
}

function formatSecurityIssue(issue) {
  const severity = formatSeverity(issue);
  return severity
    ? `- ${issue.title}\n${severity.split('\n').map(line => `  ${line}`).join('\n')}`
    : `- ${issue.title}`;
}

function calculateHealthScore(scan) {
  let score = 100;
  score -= scan.smells.reduce((sum, item) => sum + Math.ceil((item.severity?.score || 0) / 15), 0);
  score -= (scan.security.criticalIssues || []).reduce((sum, item) => sum + Math.ceil((item.severity?.score || 0) / 10), 0);
  score -= (scan.security.warningIssues || []).reduce((sum, item) => sum + Math.ceil((item.severity?.score || 0) / 20), 0);
  return Math.max(0, Math.min(100, score));
}

function table(rows) {
  return rows.join('\n');
}

function buildOverview(scan, score) {
  const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
  const codeFileCount = scan.stats.top.reduce((sum, [, value]) => sum + value.count, 0);
  return `
## 📊 نظرة عامة

| البند | القيمة |
|-------|--------|
| نوع المشروع | ${scan.isLaravel ? '🐘 Laravel PHP' : '🟢 Node.js'} |
| الأطر | ${scan.frameworks.join(' • ') || '—'} |
| إجمالي الملفات | **${scan.stats.totalLines.toLocaleString()}** سطر في **${codeFileCount}** ملف |
| متوسط حجم الملف | ${scan.stats.avgLines} سطر |
| الحجم الكلي | ${formatKb(scan.stats.totalSize)} |
| Migrations | ${scan.tables.length} جدول |
| Models | ${scan.models.length} |
| Controllers | ${scan.controllers.length} |
| Routes | ${scan.routes.summary.total || 0} |
| Health Score | ${scoreEmoji} **${score}/100** |`;
}

function buildCodeDistribution(scan) {
  const rows = scan.stats.top.map(([ext, item]) => {
    const percent = scan.stats.totalLines > 0 ? Math.round(item.lines / scan.stats.totalLines * 100) : 0;
    return `| \`${ext}\` | ${item.count} | ${item.lines.toLocaleString()} | ${percent}% |`;
  });
  return `
## 📁 توزيع الكود

| اللغة | الملفات | الأسطر | النسبة |
|-------|---------|--------|--------|
${table(rows)}`;
}

function buildLargestFiles(scan) {
  const rows = scan.stats.largest.map((file, index) => {
    const note = file.lines > 500 ? '⚠️ ضخم' : file.lines > 300 ? '🔵 كبير' : '';
    return `| ${index + 1} | \`${file.path}\` | ${file.lines.toLocaleString()} | ${note} |`;
  });
  return `
## 📋 أكبر الملفات

| # | الملف | الأسطر | الملاحظة |
|---|-------|--------|---------|
${table(rows)}`;
}

function buildDatabaseSection(scan) {
  if (scan.tables.length === 0) return '';
  return `
## 🗄️ قاعدة البيانات

${scan.tables.map(tableInfo => `
### \`${tableInfo.name}\`
${tableInfo.hasSoftDelete ? '> 🗑️ يدعم Soft Delete\n' : ''}${tableInfo.hasTimestamps ? '> ⏱️ يحتوي Timestamps\n' : ''}
| العمود | النوع |
|--------|-------|
${tableInfo.columns.slice(0, 15).map(column => `| \`${column.name}\` | \`${column.type}\` |`).join('\n')}
${tableInfo.columns.length > 15 ? `\n> ... و ${tableInfo.columns.length - 15} عمود إضافي` : ''}
`).join('\n')}`;
}

function buildModelSection(scan) {
  if (scan.models.length === 0) return '';
  return `
## 🧩 Models والعلاقات

${scan.models.map(model => `
### \`${model.name}\`${model.useSoftDelete ? ' *(Soft Delete)*' : ''}
${model.table ? `> الجدول: \`${model.table}\`\n` : ''}- **${model.lines} سطر**
${model.fillable.length > 0 ? `- **Fillable**: ${model.fillable.map(item => `\`${item}\``).join(', ')}` : '- ⚠️ لا يوجد `$fillable`'}
${model.hidden.length > 0 ? `- **Hidden**: ${model.hidden.map(item => `\`${item}\``).join(', ')}` : ''}
${model.relationships.length > 0 ? `- **العلاقات**:\n${model.relationships.map(rel => `  - \`${rel.type}(${rel.related})\``).join('\n')}` : '- لا توجد علاقات معرّفة'}
`).join('\n')}`;
}

function buildControllerSection(scan) {
  if (scan.controllers.length === 0) return '';
  const rows = scan.controllers.map(controller =>
    `| \`${controller.name}\` | ${controller.isApi ? 'API' : 'Web'} | ${controller.methods.length} | ${controller.lines} | ${controller.usesAuth ? '✅' : '—'} |`);
  return `
## 🎮 Controllers

| Controller | النوع | Methods | أسطر | Auth |
|------------|-------|---------|------|------|
${table(rows)}`;
}

function buildRoutesSection(scan) {
  if (!scan.routes.summary.total) return '';
  const summaryRows = Object.entries(scan.routes.summary)
    .filter(([key]) => key !== 'total')
    .map(([key, value]) => `| \`${key.toUpperCase()}\` | ${value} |`);
  const groups = scan.routes.groups.map(group => `
### \`${group.file}\`
${group.middlewares.length > 0 ? `**Middleware**: ${group.middlewares.map(item => `\`${item}\``).join(', ')}\n` : ''}
| Method | Path | Handler |
|--------|------|---------|
${group.routes.slice(0, 20).map(route => `| \`${route.method}\` | \`${route.path}\` | \`${route.handler.slice(0, 50)}\` |`).join('\n')}`).join('\n');
  return `
## 🌐 Routes

**إجمالي ${scan.routes.summary.total} route**

| Method | العدد |
|--------|-------|
${table(summaryRows)}
${groups}`;
}

function buildSecuritySection(scan) {
  const critical = scan.security.criticalIssues || scan.security.critical.map(item => ({ title: item }));
  const warnings = scan.security.warningIssues || scan.security.warnings.map(item => ({ title: item }));
  return `
## 🔐 تحليل الأمان

${critical.length > 0 ? `### 🔴 Critical Issues\n${critical.map(formatSecurityIssue).join('\n')}` : ''}
${warnings.length > 0 ? `\n### 🟡 Warnings\n${warnings.map(formatSecurityIssue).join('\n')}` : ''}
${scan.security.good.length > 0 ? `\n### 🟢 ممارسات جيدة\n${scan.security.good.map(item => `- ${item}`).join('\n')}` : ''}`;
}

function buildQualitySection(scan) {
  if (scan.smells.length === 0) return '## ⚙️ جودة الكود\n\n🟢 لا توجد مشاكل واضحة مكتشفة';
  return `
## ⚙️ جودة الكود

${scan.smells.map(issue => `
### ${issueIcon(issue.level)} ${issue.title}
- **التفاصيل**: ${issue.detail}
- **الحل المقترح**: ${issue.fix}
${formatSeverity(issue)}
`).join('\n')}`;
}

function buildEnvironmentSection(scan) {
  if (!scan.env) return '';
  return `
## ⚙️ بيئة التشغيل (.env)

| الإعداد | القيمة |
|---------|--------|
| APP_NAME | ${scan.env.appName || '—'} |
| APP_ENV | \`${scan.env.appEnv || '—'}\` |
| APP_DEBUG | \`${scan.env.appDebug || '—'}\` |
| APP_URL | ${scan.env.appUrl || '—'} |
| DB_CONNECTION | \`${scan.env.dbDriver || '—'}\` |
| DB_DATABASE | \`${scan.env.dbName || '—'}\` |
| CACHE_DRIVER | \`${scan.env.cacheDriver || '—'}\` |
| QUEUE_CONNECTION | \`${scan.env.queueDriver || '—'}\` |
| SESSION_DRIVER | \`${scan.env.sessionDriver || '—'}\` |
| MAIL_MAILER | \`${scan.env.mailDriver || '—'}\` |
| Redis | ${scan.env.hasRedis ? '✅ مفعّل' : '—'} |
| AWS/S3 | ${scan.env.hasS3 ? '✅ مفعّل' : '—'} |
| Pusher | ${scan.env.hasPusher ? '✅ مفعّل' : '—'} |
| إجمالي المتغيرات | ${scan.env.totalVars} |`;
}

function buildComposerSection(scan) {
  if (!scan.composer) return '';
  return `
## 📦 Composer Packages

**PHP**: ${scan.composer.phpVersion || '—'} | **Laravel**: ${scan.composer.laravelVersion || '—'}

### Runtime Dependencies (${scan.composer.packages.length})
${scan.composer.packages.map(item => `- \`${item}\``).join('\n') || '- لا يوجد'}

### Dev Dependencies (${scan.composer.devPackages.length})
${scan.composer.devPackages.map(item => `- \`${item}\``).join('\n') || '- لا يوجد'}`;
}

function buildRecommendations(scan) {
  const recs = [];
  if (scan.smells.some(item => item.level === 'error' && item.title.includes('اختبار'))) recs.push('📋 **أولوية عالية**: أضف Test Suite — ابدأ بـ Feature Tests للـ API endpoints');
  if (scan.security.critical.length > 0) recs.push('🔐 **أولوية عالية**: عالج المشاكل الأمنية فوراً قبل أي deployment');
  if (scan.smells.some(item => item.title.includes('N+1'))) recs.push('⚡ **أداء**: استخدم Laravel Debugbar لاكتشاف N+1 queries في بيئة التطوير');
  if (scan.smells.some(item => item.title.includes('God Controller'))) recs.push('🏗️ **معمارية**: حوّل God Controllers إلى Service Classes أو Action Classes');
  if (!scan.env?.hasRedis && scan.routes.summary.total > 20) recs.push('💡 **أداء**: فكّر في إضافة Redis لـ Cache وQueue مع تزايد الـ routes');
  if (scan.tables.length > 10 && scan.models.length < scan.tables.length) recs.push(`🔍 **تنظيم**: ${scan.tables.length - scan.models.length} جدول بدون Model مقابل — تحقق من اكتمال البنية`);
  return recs.length > 0 ? `## 💡 التوصيات\n\n${recs.join('\n')}` : '';
}

function buildConfigSection(scan) {
  return `
## ✅ ملفات الإعداد

| الملف | الحالة |
|-------|--------|
${scan.configCheck.map(item => `| \`${item.name}\` | ${item.exists ? '✅ موجود' : '❌ غائب'} |`).join('\n')}`;
}

function generateReport(scan) {
  const date = new Date(scan.scannedAt);
  const dateStr = `${date.toLocaleDateString('ar')} — ${date.toLocaleTimeString('ar')}`;
  const score = calculateHealthScore(scan);
  const sections = [
    `# تقرير تقني: ${scan.name}\n\n> 🤖 فحص ثابت شامل • بدون AI tokens • ${dateStr}`,
    buildOverview(scan, score),
    buildCodeDistribution(scan),
    buildLargestFiles(scan),
    buildDatabaseSection(scan),
    buildModelSection(scan),
    buildControllerSection(scan),
    buildRoutesSection(scan),
    buildEnvironmentSection(scan),
    buildSecuritySection(scan),
    buildQualitySection(scan),
    buildComposerSection(scan),
    buildRecommendations(scan),
    buildConfigSection(scan),
    `*🔍 تم بالفحص الثابت (Static Analysis) — صفر AI tokens — ${date.toLocaleDateString('ar')}*`,
  ].filter(Boolean);
  return sections.join('\n\n---\n\n');
}

module.exports = {
  calculateHealthScore,
  generateReport,
};
