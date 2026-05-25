/**
 * Scan Service v3 — تقرير احترافي شامل
 * يقرأ محتوى الملفات ويحلل البنية والجودة والأمان
 */
const fs   = require('fs');
const path = require('path');
const { enrichIssues } = require('./severityEngine');

// ─── إعدادات التجاهل ────────────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', 'vendor', '__pycache__', '.venv', 'venv',
  'framework', 'debugbar', 'clockwork', 'telescope',
]);
const SKIP_PATH_PREFIXES = [
  'storage/framework', 'storage/logs', 'bootstrap/cache',
  'public/hot', 'public/storage', 'public/build',
];

const CODE_EXTS = new Set([
  '.php', '.js', '.jsx', '.ts', '.tsx', '.vue', '.py',
  '.css', '.scss', '.html', '.blade', '.sql', '.sh',
  '.json', '.yaml', '.yml', '.md', '.env', '.toml',
]);

function isCacheFile(name) {
  return /^[a-f0-9]{20,}$/.test(path.basename(name, path.extname(name)));
}

// ─── أدوات مساعدة ──────────────────────────────────────────────
function safeJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// ─── تجوّل الملفات ─────────────────────────────────────────────
function walkDir(rootDir, dir = rootDir, results = [], max = 5000) {
  if (results.length >= max) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }

  for (const e of entries) {
    if (results.length >= max) break;
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel  = path.relative(rootDir, full).replace(/\\/g, '/');
    if (SKIP_PATH_PREFIXES.some(p => rel.startsWith(p))) continue;
    if (isCacheFile(e.name)) continue;

    if (e.isDirectory()) {
      walkDir(rootDir, full, results, max);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      let size = 0, lines = 0, content = '';
      try {
        size = fs.statSync(full).size;
        if (size < 400_000 && (CODE_EXTS.has(ext) || !ext)) {
          content = fs.readFileSync(full, 'utf8');
          lines   = content.split('\n').length;
        }
      } catch {}
      results.push({ path: rel, name: e.name, ext, size, lines, content });
    }
  }
  return results;
}

// ════════════════════════════════════════════════════
// تحليل Laravel
// ════════════════════════════════════════════════════

// ─── قراءة Migrations واستخراج الجداول ─────────────────────────
function analyzeMigrations(rootDir, files) {
  const tables = [];
  const migFiles = files.filter(f => f.path.startsWith('database/migrations/') && f.ext === '.php');

  for (const mig of migFiles) {
    // اسم الجدول من create_xxx_table أو Schema::create('xxx')
    const tableMatch = mig.content.match(/Schema::create\s*\(\s*['"]([^'"]+)['"]/);
    if (!tableMatch) continue;

    const tableName = tableMatch[1];
    const columns   = [];

    // استخراج الأعمدة
    const colMatches = mig.content.matchAll(/\$table->(\w+)\s*\(\s*['"]([^'"]+)['"]/g);
    for (const m of colMatches) {
      if (['timestamps', 'softDeletes', 'id', 'rememberToken'].includes(m[1])) continue;
      columns.push({ type: m[1], name: m[2] });
    }

    tables.push({
      name:      tableName,
      file:      path.basename(mig.name, '.php'),
      columns,
      hasSoftDelete: mig.content.includes('softDeletes'),
      hasTimestamps: mig.content.includes('timestamps()'),
    });
  }
  return tables;
}

// ─── تحليل Models ──────────────────────────────────────────────
function analyzeModels(rootDir, files) {
  const modelFiles = files.filter(f =>
    f.path.startsWith('app/Models/') && f.ext === '.php' && f.content
  );

  return modelFiles.map(f => {
    const relationships = [];
    const types = ['hasMany', 'hasOne', 'belongsTo', 'belongsToMany', 'hasManyThrough', 'morphMany', 'morphTo'];
    for (const type of types) {
      const matches = f.content.matchAll(new RegExp(`${type}\\s*\\(\\s*([^)]+)\\)`, 'g'));
      for (const m of matches) {
        const related = m[1].match(/['"]([^'"]+)['"]/)?.[1] || m[1].trim();
        relationships.push({ type, related: path.basename(related.replace(/\\/g, '/')) });
      }
    }
    const fillable   = (f.content.match(/\$fillable\s*=\s*\[([^\]]+)\]/s)?.[1] || '')
      .match(/['"]([^'"]+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [];
    const hidden     = (f.content.match(/\$hidden\s*=\s*\[([^\]]+)\]/s)?.[1] || '')
      .match(/['"]([^'"]+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [];
    const useSoftDelete = f.content.includes('SoftDeletes');
    const table      = f.content.match(/protected\s+\$table\s*=\s*['"]([^'"]+)['"]/)?.[1] || null;

    return {
      name:          path.basename(f.name, '.php'),
      file:          f.path,
      relationships,
      fillable,
      hidden,
      useSoftDelete,
      table,
      lines:         f.lines,
    };
  });
}

// ─── تحليل Controllers ─────────────────────────────────────────
function analyzeControllers(rootDir, files) {
  const ctrlFiles = files.filter(f =>
    f.path.includes('/Controllers/') && f.ext === '.php' && f.content
  );

  return ctrlFiles.map(f => {
    const methods = [...f.content.matchAll(/public\s+function\s+(\w+)\s*\(/g)]
      .map(m => m[1])
      .filter(m => !['__construct', '__invoke'].includes(m));

    const usesAuth    = f.content.includes('auth(') || f.content.includes('Auth::');
    const usesRequest = f.content.includes('Request $');
    const returnTypes = {
      json:     (f.content.match(/->json\(/g) || []).length,
      view:     (f.content.match(/view\(/g)   || []).length,
      redirect: (f.content.match(/redirect\(/g)||[]).length,
    };

    return {
      name:      path.basename(f.name, '.php'),
      file:      f.path,
      methods,
      usesAuth,
      usesRequest,
      returnTypes,
      lines:     f.lines,
      isApi:     f.path.includes('Api/') || f.path.includes('API/'),
    };
  });
}

// ─── تحليل Routes ──────────────────────────────────────────────
function analyzeRoutes(rootDir) {
  const routeFiles = [
    'routes/web.php', 'routes/api.php', 'routes/admin.php',
    'routes/auth.php', 'routes/console.php', 'routes/channels.php',
  ];
  const groups  = [];
  const summary = { get: 0, post: 0, put: 0, delete: 0, patch: 0, resource: 0, total: 0 };

  for (const rf of routeFiles) {
    const content = safeRead(path.join(rootDir, rf));
    if (!content) continue;

    const routes = [];
    const patterns = [
      /Route::(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/gi,
      /Route::(resource|apiResource)\s*\(\s*['"]([^'"]+)['"]/gi,
    ];

    for (const pattern of patterns) {
      for (const m of content.matchAll(pattern)) {
        const method = m[1].toUpperCase();
        routes.push({ method, path: m[2], handler: (m[3] || '').trim().slice(0, 60) });
        summary[m[1].toLowerCase()] = (summary[m[1].toLowerCase()] || 0) + 1;
        summary.total++;
      }
    }

    // middleware groups
    const middlewares = [...content.matchAll(/middleware\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

    if (routes.length > 0) {
      groups.push({ file: rf, routes: routes.slice(0, 30), middlewares: [...new Set(middlewares)] });
    }
  }

  return { groups, summary };
}

// ─── تحليل .env ────────────────────────────────────────────────
function analyzeEnv(rootDir) {
  const content = safeRead(path.join(rootDir, '.env'));
  if (!content) return null;

  const get = key => content.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() || null;

  return {
    appName:    get('APP_NAME'),
    appEnv:     get('APP_ENV'),
    appDebug:   get('APP_DEBUG'),
    appUrl:     get('APP_URL'),
    dbDriver:   get('DB_CONNECTION'),
    dbHost:     get('DB_HOST'),
    dbName:     get('DB_DATABASE'),
    cacheDriver:get('CACHE_DRIVER'),
    queueDriver:get('QUEUE_CONNECTION'),
    sessionDriver: get('SESSION_DRIVER'),
    mailDriver: get('MAIL_MAILER'),
    hasRedis:   content.includes('REDIS_HOST'),
    hasS3:      content.includes('AWS_ACCESS_KEY'),
    hasPusher:  content.includes('PUSHER_APP_KEY'),
    totalVars:  content.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).length,
  };
}

// ─── تحليل Composer ────────────────────────────────────────────
function analyzeComposer(rootDir) {
  const composer = safeJSON(path.join(rootDir, 'composer.json'));
  if (!composer) return null;

  const req    = composer.require    || {};
  const reqDev = composer['require-dev'] || {};

  const laravelVersion = req['laravel/framework']?.replace(/[^0-9.]/g, '') || null;

  const notablePackages = Object.keys(req).filter(k => k !== 'php' && !k.startsWith('ext-'));
  const devPackages     = Object.keys(reqDev);

  return {
    name:           composer.name,
    description:    composer.description,
    phpVersion:     req.php,
    laravelVersion,
    packages:       notablePackages,
    devPackages,
    autoload:       Object.keys(composer.autoload?.['psr-4'] || {}),
    scripts:        Object.keys(composer.scripts || {}),
  };
}

// ─── كشف مشاكل الكود ───────────────────────────────────────────
function detectCodeSmells(files) {
  const issues = [];

  // ملفات ضخمة
  const huge = files.filter(f => f.lines > 500 && f.ext === '.php');
  if (huge.length > 0) {
    issues.push({
      level: 'warning',
      title: `${huge.length} ملف PHP يتجاوز 500 سطر`,
      detail: huge.slice(0, 5).map(f => `\`${f.path}\` (${f.lines} سطر)`).join(', '),
      fix: 'فكّر في تقسيمها إلى Services أو Traits',
    });
  }

  // controllers ضخمة (God Controllers)
  const godControllers = files.filter(f =>
    f.path.includes('Controller') && f.lines > 300
  );
  if (godControllers.length > 0) {
    issues.push({
      level: 'warning',
      title: `${godControllers.length} God Controller (أكثر من 300 سطر)`,
      detail: godControllers.map(f => `\`${path.basename(f.name)}\` (${f.lines} سطر)`).join(', '),
      fix: 'استخدم Service Classes أو Action Classes لتوزيع المنطق',
    });
  }

  // غياب tests
  const testFiles = files.filter(f => f.path.startsWith('tests/') && f.ext === '.php');
  const phpFiles  = files.filter(f => f.ext === '.php' && f.path.startsWith('app/'));
  const testRatio = phpFiles.length > 0 ? (testFiles.length / phpFiles.length) : 0;
  if (testRatio < 0.1) {
    issues.push({
      level: 'error',
      title: 'نسبة الاختبارات منخفضة جداً',
      detail: `${testFiles.length} ملف test مقابل ${phpFiles.length} ملف PHP`,
      fix: 'أضف Feature Tests وUnit Tests لكل Model وController',
    });
  }

  // كشف N+1 queries محتملة (Eloquent بدون eager loading)
  const withoutEager = files.filter(f =>
    f.ext === '.php' && f.content.includes('->get()') &&
    !f.content.includes('->with(') && !f.content.includes('->load(')
  );
  if (withoutEager.length > 2) {
    issues.push({
      level: 'info',
      title: 'احتمال N+1 Query Problem',
      detail: `${withoutEager.length} ملف يستخدم ->get() بدون eager loading`,
      fix: 'استخدم ->with(\'relation\') لتجنب N+1 queries',
    });
  }

  // missing validation
  const controllersWithoutValidation = files.filter(f =>
    f.path.includes('Controller') && f.ext === '.php' &&
    (f.content.includes('->store(') || f.content.includes('->update(')) &&
    !f.content.includes('validate(') && !f.content.includes('FormRequest')
  );
  if (controllersWithoutValidation.length > 0) {
    issues.push({
      level: 'warning',
      title: 'Controllers بدون validation',
      detail: controllersWithoutValidation.slice(0, 3).map(f => `\`${f.name}\``).join(', '),
      fix: 'استخدم Form Request Classes أو $request->validate()',
    });
  }

  return issues;
}

// ─── فحص الأمان ────────────────────────────────────────────────
function securityScan(rootDir, files, env) {
  const critical = [], warnings = [], good = [];

  // .env في gitignore
  const gitignore = safeRead(path.join(rootDir, '.gitignore'));
  if (gitignore.includes('.env')) good.push('`.env` مُدرج في `.gitignore`');
  else critical.push('`.env` غير مُدرج في `.gitignore` — خطر تسريب بيانات');

  // APP_DEBUG في production
  if (env?.appEnv === 'production' && env?.appDebug === 'true') {
    critical.push('`APP_DEBUG=true` مع `APP_ENV=production` — خطر كشف stack traces');
  } else if (env?.appDebug === 'false') {
    good.push('`APP_DEBUG=false` مضبوط بشكل صحيح');
  }

  // APP_KEY
  const envContent = safeRead(path.join(rootDir, '.env'));
  if (!envContent.includes('APP_KEY=base64:')) {
    critical.push('`APP_KEY` غير مضبوط — تشفير Sessions و Cookies معطّل');
  } else {
    good.push('`APP_KEY` مضبوط بشكل صحيح');
  }

  // SQL Injection — raw queries
  const rawQueries = files.filter(f =>
    f.ext === '.php' && (
      f.content.includes('DB::statement("SELECT') ||
      f.content.includes("DB::statement('SELECT") ||
      (f.content.includes('DB::select(') && f.content.includes('$_') )
    )
  );
  if (rawQueries.length > 0) {
    critical.push(`Raw SQL queries مشبوهة في ${rawQueries.length} ملف — تحقق من SQL Injection`);
  }

  // mass assignment
  const massAssignment = files.filter(f =>
    f.ext === '.php' && f.path.includes('Models') &&
    f.content.includes('protected $guarded = []')
  );
  if (massAssignment.length > 0) {
    warnings.push(`${massAssignment.length} Model يستخدم \`$guarded = []\` — Mass Assignment بدون قيود`);
  }

  // CSRF
  if (files.some(f => f.path.includes('Kernel.php') && f.content.includes('VerifyCsrfToken'))) {
    good.push('CSRF Protection مفعّلة');
  }

  // HTTPS check
  if (env?.appUrl?.startsWith('https://')) good.push('APP_URL يستخدم HTTPS');
  else if (env?.appUrl) warnings.push('APP_URL لا يستخدم HTTPS');

  return {
    critical,
    warnings,
    good,
    criticalIssues: enrichIssues(critical.map(item => ({
      level: 'critical',
      title: item,
      detail: item,
      category: 'security',
    }))),
    warningIssues: enrichIssues(warnings.map(item => ({
      level: 'warning',
      title: item,
      detail: item,
      category: 'security',
    }))),
  };
}

// ─── إحصائيات الكود ────────────────────────────────────────────
function codeStats(files) {
  const byExt = {};
  let totalLines = 0, totalSize = 0;

  for (const f of files) {
    const key = f.ext || '(none)';
    if (!byExt[key]) byExt[key] = { count: 0, lines: 0, size: 0 };
    byExt[key].count++;
    byExt[key].lines += f.lines;
    byExt[key].size  += f.size;
    totalLines += f.lines;
    totalSize  += f.size;
  }

  const skip = new Set(['.json', '.lock', '.md', '.yml', '.yaml', '.env', '(none)', '.toml']);
  const top  = Object.entries(byExt)
    .filter(([e]) => !skip.has(e))
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, 8);

  const largest = [...files]
    .filter(f => f.lines > 30 && !f.name.endsWith('.lock') && !isCacheFile(f.name))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 15);

  const avgLines = files.length > 0 ? Math.round(totalLines / files.length) : 0;

  return { byExt, top, largest, totalLines, totalSize, avgLines };
}

// ════════════════════════════════════════════════════
// الفحص الرئيسي
// ════════════════════════════════════════════════════
function scanProject(rootDir) {
  const pkg      = safeJSON(path.join(rootDir, 'package.json'));
  const composer = analyzeComposer(rootDir);
  const isLaravel = !!(composer?.laravelVersion);

  const files    = walkDir(rootDir);
  const stats    = codeStats(files);
  const env      = analyzeEnv(rootDir);

  const frameworks = [];
  if (composer?.laravelVersion)    frameworks.push(`Laravel ${composer.laravelVersion}`);
  if (composer?.packages.includes('filament/filament')) frameworks.push('Filament Admin');
  if (composer?.packages.includes('livewire/livewire')) frameworks.push('Livewire');
  if (composer?.packages.includes('inertiajs/inertia-laravel')) frameworks.push('Inertia.js');
  if (pkg?.devDependencies?.['laravel-vite-plugin']) frameworks.push('Vite + Laravel');
  if (pkg?.devDependencies?.tailwindcss || pkg?.dependencies?.tailwindcss)
    frameworks.push('Tailwind CSS');
  if (pkg?.devDependencies?.react || pkg?.dependencies?.react) frameworks.push('React');
  if (pkg?.devDependencies?.vue   || pkg?.dependencies?.vue)   frameworks.push('Vue.js');

  const tables      = isLaravel ? analyzeMigrations(rootDir, files)  : [];
  const models      = isLaravel ? analyzeModels(rootDir, files)      : [];
  const controllers = isLaravel ? analyzeControllers(rootDir, files) : [];
  const routes      = isLaravel ? analyzeRoutes(rootDir) : { groups: [], summary: {} };
  const smells      = enrichIssues(detectCodeSmells(files).map(item => ({ ...item, category: 'quality' })));
  const security    = securityScan(rootDir, files, env);

  // ملفات الإعداد
  const configCheck = [
    'composer.json', 'package.json', '.env', '.env.example', '.gitignore',
    'phpunit.xml', 'vite.config.js', 'docker-compose.yml', 'Dockerfile',
    'README.md', 'routes/web.php', 'routes/api.php',
    'app/Http/Kernel.php', 'config/database.php', 'config/app.php',
    'tailwind.config.js', '.editorconfig', 'artisan',
  ].map(f => ({ name: f, exists: exists(path.join(rootDir, f)) }));

  return {
    rootDir,
    name:        composer?.name || pkg?.name || path.basename(rootDir),
    description: composer?.description || pkg?.description || '',
    isLaravel,
    frameworks,
    stats,
    env,
    composer,
    pkg,
    tables,
    models,
    controllers,
    routes,
    smells,
    security,
    configCheck,
    scannedAt: new Date().toISOString(),
  };
}

const { generateReport } = require('./scanReportService');

module.exports = { scanProject, generateReport };
