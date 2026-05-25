// server/supervisor.js
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { createEnvReader } = require('./services/envService');

const MAX_RESTARTS_PER_MINUTE = 5;
const DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

let child = null;
let restartTimer = null;
let stopping = false;
let restartCount = 0;
let deathTimestamps = [];

function getServerPort(env = createEnvReader()) {
  return Number(env.get('PORT', '3001'));
}

function checkExistingServer(port = getServerPort()) {
  return new Promise(resolve => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/health',
      timeout: 750,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data?.success === true && data?.service === 'octopus-ai');
        } catch {
          resolve(false);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function getDelay() {
  if (restartCount === 0) return 0;
  const index = Math.min(restartCount - 1, DELAYS.length - 1);
  return DELAYS[index];
}

function recordDeath() {
  const now = Date.now();
  deathTimestamps.push(now);
  // احتفظ فقط بعمليات الموت في آخر 60 ثانية
  deathTimestamps = deathTimestamps.filter(t => now - t <= 60000);
  restartCount++;
}

function shouldStopRestarting() {
  const now = Date.now();
  const recentDeaths = deathTimestamps.filter(t => now - t <= 60000).length;
  return recentDeaths > MAX_RESTARTS_PER_MINUTE;
}

function startServer({ onStatus } = {}) {
  if (child || restartTimer) return;
  stopping = false;

  if (shouldStopRestarting()) {
    const message = 'تم إيقاف إعادة التشغيل تلقائياً: العملية ماتت أكثر من 5 مرات في آخر 60 ثانية.';
    console.error('\n' + '='.repeat(60));
    console.error('🛑 ' + message);
    console.error('يرجى التحقق من الأخطاء أعلاه وإصلاح الكود يدوياً.');
    console.error('='.repeat(60) + '\n');
    onStatus?.({ type: 'stopped', reason: 'restart-limit', message });
    if (require.main === module) process.exit(1);
    return;
  }

  const delay = getDelay();
  if (delay > 0) {
    console.log(`\n⏳ الانتظار ${delay / 1000} ثوانٍ قبل إعادة التشغيل (المحاولة رقم ${restartCount + 1})...`);
  }

  restartTimer = setTimeout(async () => {
    restartTimer = null;
    if (stopping) return;

    const port = getServerPort();
    if (await checkExistingServer(port)) {
      console.log(`\n✅ خادم أخطبوط يعمل مسبقاً على http://localhost:${port} — لن يتم تشغيل نسخة ثانية.`);
      onStatus?.({ type: 'existing', port });
      return;
    }

    console.log('\n🚀 جاري تشغيل الخادم...');
    
    child = spawn('node', [path.join(__dirname, 'index.js')], {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });

    child.on('spawn', () => {
      onStatus?.({ type: 'started', pid: child.pid });
    });

    child.on('exit', (code, signal) => {
      const died = { code, signal };
      child = null;

      if (stopping) {
        onStatus?.({ type: 'stopped', ...died });
        return;
      }

      if (code === 0) {
        console.log('\n✅ الخادم توقف بشكل طبيعي (exit code: 0). لن تتم إعادة التشغيل.');
        onStatus?.({ type: 'exited', ...died });
        return;
      }

      recordDeath();

      if (code === 1) {
        console.error('\n❌ الخادم توقف بسبب خطأ (exit code: 1). يرجى مراجعة الخطأ أعلاه.');
      } else if (code !== null) {
        console.log(`\n⚠️ الخادم توقف بكود: ${code}`);
      } else {
        console.log(`\n⚠️ الخادم توقف بالإشارة: ${signal}`);
      }

      onStatus?.({ type: 'died', ...died });

      // محاولة إعادة التشغيل
      startServer({ onStatus });
    });

  }, delay);
}

function stop() {
  stopping = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!child) return;
  try {
    child.kill('SIGTERM');
  } catch {}
  child = null;
}

function getPid() {
  return child?.pid || null;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  start: startServer,
  stop,
  getPid,
};
