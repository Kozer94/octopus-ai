/**
 * Session Store — Octopus AI
 *
 * يخزّن session history مشفّراً في الذاكرة مع:
 *   - AES-256-CBC encryption لكل message
 *   - LRU eviction عند الوصول لـ MAX_SESSIONS
 *   - TTL cleanup كل 5 دقائق
 *   - metadata companion (lastModel, tokenUsage, requestCount)
 *
 * الواجهة الخارجية (backward compatible):
 *   sessions[id]          → Array<{role, content}> | undefined
 *   sessions[id] = array  → يُشفَّر ويُخزَّن
 *   sessions.setMeta(id, meta) → يُضيف/يحدّث metadata للـ session
 *   sessions.getMeta(id)       → { lastModel, tokenUsage, requestCount, ... } | null
 */

const crypto = require('crypto');
const logger  = require('./logger').withContext('SessionStore');

const MAX_SESSIONS          = 500;
const SESSION_TTL_MS        = 30 * 60 * 1000;   // 30 min inactivity
const CLEANUP_INTERVAL_MS   = 5 * 60 * 1000;    // cleanup every 5 min
const MAX_MESSAGES_PER_SESSION = 16;             // رُفع من 8 → 16 لأن session fix يستخدم assignment

// ─── Encryption (AES-256-CBC) ─────────────────────────────────
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH      = 16;

function encrypt(text) {
  try {
    const iv      = crypto.randomBytes(IV_LENGTH);
    const cipher  = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted    += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch {
    return text;
  }
}

function decrypt(encryptedText) {
  try {
    const parts   = String(encryptedText).split(':');
    if (parts.length !== 2) return encryptedText;
    const iv       = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted  = decipher.update(parts[1], 'hex', 'utf8');
    decrypted     += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return encryptedText;
  }
}

// ─── Factory ──────────────────────────────────────────────────

function createSessionStore() {
  // Map<sessionId, { data: EncryptedMessage[], lastAccess: number }>
  const store    = new Map();
  // Map<sessionId, SessionMeta>
  const metaMap  = new Map();

  // ── LRU eviction ──────────────────────────────────────────
  function evictOldest() {
    let oldestId   = null;
    let oldestTime = Infinity;
    for (const [id, entry] of store) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestId   = id;
      }
    }
    if (oldestId !== null) {
      store.delete(oldestId);
      metaMap.delete(oldestId);
      logger.debug(`evicted LRU session: ${oldestId}`);
    }
  }

  // ── TTL cleanup ────────────────────────────────────────────
  function cleanup() {
    const now     = Date.now();
    let   removed = 0;
    for (const [id, entry] of store) {
      if (now - entry.lastAccess > SESSION_TTL_MS) {
        store.delete(id);
        metaMap.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`TTL cleanup: removed ${removed} sessions, ${store.size} remaining`);
    }
  }

  const interval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  if (interval.unref) interval.unref();

  // ── Proxy ──────────────────────────────────────────────────
  const proxy = new Proxy({}, {

    get(_, key) {
      // ─── Special method keys ───────────────────────────────
      if (key === '__store__') return store;   // debug access

      /** sessions.setMeta(sessionId, { lastModel, tokenUsage, ... }) */
      if (key === 'setMeta') {
        return (sessionId, meta) => {
          const existing = metaMap.get(sessionId) || { requestCount: 0, tokenUsage: 0, lastModel: null };
          metaMap.set(sessionId, {
            ...existing,
            ...meta,
            requestCount: (existing.requestCount || 0) + (meta._increment ? 1 : 0),
            updatedAt: Date.now(),
          });
        };
      }

      /** sessions.getMeta(sessionId) → object | null */
      if (key === 'getMeta') {
        return (sessionId) => metaMap.get(sessionId) || null;
      }

      /** sessions.listSessions() → [{ sessionId, messageCount, meta }] */
      if (key === 'listSessions') {
        return () => [...store.entries()].map(([id, entry]) => ({
          sessionId:    id,
          messageCount: entry.data.length,
          lastAccess:   entry.lastAccess,
          meta:         metaMap.get(id) || null,
        }));
      }

      // ─── Normal session access ────────────────────────────
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
      // لا نستقبل assignments على المفاتيح الخاصة
      if (key === 'setMeta' || key === 'getMeta' || key === 'listSessions' || key === '__store__') {
        return true;
      }
      if (!store.has(key) && store.size >= MAX_SESSIONS) {
        evictOldest();
      }
      // 🔒 تشفير + حد أقصى
      const limited   = Array.isArray(value) ? value.slice(-MAX_MESSAGES_PER_SESSION) : value;
      const encrypted = Array.isArray(limited)
        ? limited.map(msg => ({
            role: msg.role,
            _enc: true,
            _ct:  encrypt(msg.content),
          }))
        : limited;
      store.set(key, { data: encrypted, lastAccess: Date.now() });
      return true;
    },

    has(_, key) {
      if (key === 'setMeta' || key === 'getMeta' || key === 'listSessions') return true;
      return store.has(key);
    },

    deleteProperty(_, key) {
      metaMap.delete(key);
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

  return proxy;
}

module.exports = { createSessionStore };
