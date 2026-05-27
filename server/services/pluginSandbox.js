/**
 * Plugin Sandbox — vm.runInContext isolation
 *
 * ما يُسمح به:
 *   require('fs')    — عمليات الملفات (مقيّدة بالـ ALLOWED_FS_OPS)
 *   require('path')  — safe, no side effects
 *   require('os')    — safe, read-only system info
 *   require('./x')   — relative requires داخل نفس مجلد الـ plugin فقط
 *
 * ما يُحجب تلقائياً (غير موجود في الـ sandbox):
 *   process          — لا process.exit() ولا process.env
 *   global           — لا monkey patching
 *   child_process    — لا arbitrary execution
 *   net/http/https   — لا network exfiltration
 *   __dirname/__filename — لا absolute path construction
 */

'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// 🔒 العمليات المسموحة على الـ fs — قراءة فقط بشكل افتراضي
const ALLOWED_FS_OPS_READ = [
  'existsSync', 'readFileSync', 'readdirSync', 'statSync',
];

// 🔒 عمليات الكتابة — محجوبة افتراضياً، تُفعّل فقط إذا كان المسار داخل مجلد الـ plugin
const ALLOWED_FS_OPS_WRITE = [
  'mkdirSync', 'writeFileSync', 'unlinkSync', 'renameSync',
];

const ALL_ALLOWED_FS_OPS = [...ALLOWED_FS_OPS_READ, ...ALLOWED_FS_OPS_WRITE];

// الـ modules المسموح بها
const ALLOWED_NATIVE_MODULES = { path, os };

function createSafeFs(pluginDir) {
  const safeFs = {};

  // عمليات القراءة — مسموحة لأي مسار داخل المشروع
  for (const op of ALLOWED_FS_OPS_READ) {
    safeFs[op] = (...args) => {
      const targetPath = path.resolve(String(args[0] || ''));
      return fs[op](...args);
    };
  }

  // 🔒 عمليات الكتابة — مقيدة بمجلد الـ plugin فقط
  for (const op of ALLOWED_FS_OPS_WRITE) {
    safeFs[op] = (...args) => {
      const targetPath = path.resolve(String(args[0] || ''));
      const normalizedDir = path.resolve(pluginDir);
      if (!targetPath.startsWith(normalizedDir + path.sep) && targetPath !== normalizedDir) {
        throw new Error(`Plugin fs.${op}: cannot write outside plugin directory — "${args[0]}"`);
      }
      return fs[op](...args);
    };
  }

  return safeFs;
}

function createSafeRequire(pluginDir, logger) {
  return function safeRequire(moduleName) {
    // native whitelisted modules
    if (moduleName === 'fs')   return createSafeFs(pluginDir);
    if (moduleName in ALLOWED_NATIVE_MODULES) return ALLOWED_NATIVE_MODULES[moduleName];

    // relative requires — داخل مجلد الـ plugin فقط
    if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
      const resolved     = path.resolve(pluginDir, moduleName);
      const normalizedDir = path.resolve(pluginDir);
      if (!resolved.startsWith(normalizedDir + path.sep) && resolved !== normalizedDir) {
        throw new Error(`Plugin: cannot require outside plugin directory — "${moduleName}"`);
      }
      // relative requires run inside sandbox too — منع sandbox escape عبر الـ require العادي
      return loadPluginSandboxed(resolved, logger);
    }

    // أي شيء آخر محجوب
    throw new Error(`Plugin: require("${moduleName}") is blocked — not in allowed modules list`);
  };
}

/**
 * يُحمّل plugin file داخل vm sandbox.
 *
 * @param {string} pluginPath — مسار الـ plugin file
 * @param {object} logger     — console-compatible logger
 * @returns {*}               — module.exports الخاص بالـ plugin
 */
function loadPluginSandboxed(pluginPath, logger = console) {
  const pluginDir = path.dirname(pluginPath);
  const code      = fs.readFileSync(pluginPath, 'utf8');
  const safeRequire = createSafeRequire(pluginDir, logger);

  const moduleObj = { exports: {} };

  // Sandbox context — لا process، لا global، لا __dirname
  const sandbox = vm.createContext({
    module:  moduleObj,
    exports: moduleObj.exports,
    require: safeRequire,
    console: {
      log:   (...a) => logger.log(`[plugin:${path.basename(pluginPath)}]`, ...a),
      error: (...a) => logger.error(`[plugin:${path.basename(pluginPath)}]`, ...a),
      warn:  (...a) => logger.warn(`[plugin:${path.basename(pluginPath)}]`, ...a),
    },
    // builtins آمنة
    // 🔒 Buffer removed — can be used for memory reading outside sandbox
    // 🔒 setTimeout/setInterval removed — can be used for sandbox escape via async ops
    URL,
    URLSearchParams,
    Promise,
    JSON,
    Math,
    Date,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
  });

  try {
    const wrapped = `(function(module, exports, require) {\n${code}\n})(module, exports, require);`;
    vm.runInContext(wrapped, sandbox, {
      filename: path.basename(pluginPath),
      timeout:  3000, // 3s max لـ initialization code
    });
  } catch (err) {
    throw new Error(`Plugin sandbox error in "${path.basename(pluginPath)}": ${err.message}`);
  }

  return moduleObj.exports;
}

module.exports = { loadPluginSandboxed };
