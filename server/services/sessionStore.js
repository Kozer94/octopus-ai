const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 30 * 60 * 1000;    // 30 min inactivity
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // cleanup every 5 min

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
      return entry.data;
    },

    set(_, key, value) {
      if (!store.has(key) && store.size >= MAX_SESSIONS) {
        evictOldest();
      }
      store.set(key, { data: value, lastAccess: Date.now() });
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
