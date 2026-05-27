const crypto = require('crypto');
const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 30 * 60 * 1000;    // 30 min inactivity
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // cleanup every 5 min
const MAX_MESSAGES_PER_SESSION = 8;         // 🔒 حد أقصى للرسائل لكل جلسة

// 🔒 تشفير بسيط للبيانات الحساسة في الذاكرة
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch {
    return text; // fallback للبيانات غير القابلة للتشفير
  }
}

function decrypt(encryptedText) {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText;
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return encryptedText; // fallback
  }
}

function createSessionStore() {
  // Map<sessionId, { data: [], lastAccess: timestamp }>
  const store = new Map();

  function evictOldest() {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, entry] of store) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestId = id;
      }
    }
    if (oldestId !== null) {
      store.delete(oldestId);
      console.log(`[SessionStore] evicted LRU session: ${oldestId}`);
    }
  }

  function cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [id, entry] of store) {
      if (now - entry.lastAccess > SESSION_TTL_MS) {
        store.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[SessionStore] TTL cleanup: removed ${removed} sessions, ${store.size} remaining`);
    }
  }

  const interval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  if (interval.unref) interval.unref(); // لا يمنع إغلاق العملية

  return new Proxy({}, {
    get(_, key) {
      if (key === '__store__') return store; // للـ debugging فقط
      const entry = store.get(key);
      if (!entry) return undefined;
      entry.lastAccess = Date.now();
      // 🔒 فك تشفير البيانات عند القراءة
      return entry.data.map(msg => {
        if (msg._enc && msg._ct) {
          return { role: msg.role, content: decrypt(msg._ct) };
        }
        return msg;
      });
    },

    set(_, key, value) {
      if (!store.has(key) && store.size >= MAX_SESSIONS) {
        evictOldest();
      }
      // 🔒 تشفير البيانات عند الحفظ + حد أقصى للرسائل
      const limited = Array.isArray(value) ? value.slice(-MAX_MESSAGES_PER_SESSION) : value;
      const encrypted = Array.isArray(limited)
        ? limited.map(msg => ({
            role: msg.role,
            _enc: true,
            _ct: encrypt(msg.content),
          }))
        : limited;
      store.set(key, { data: encrypted, lastAccess: Date.now() });
      return true;
    },

    has(_, key) {
      return store.has(key);
    },

    deleteProperty(_, key) {
      return store.delete(key);
    },

    ownKeys() {
      return [...store.keys()];
    },

    getOwnPropertyDescriptor(_, key) {
      if (!store.has(key)) return undefined;
      return { enumerable: true, configurable: true, writable: true, value: store.get(key).data };
    },
  });
}

module.exports = { createSessionStore };
