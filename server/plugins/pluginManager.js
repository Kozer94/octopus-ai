/**
 * Plugin Manager
 * مدير الإضافات - يدير تحميل وتفعيل وتعطيل الإضافات
 */

const fs = require('fs');
const path = require('path');

function normalizeHookCallbacks(callbacks) {
  if (!callbacks) return [];
  return Array.isArray(callbacks) ? callbacks.filter(fn => typeof fn === 'function') : [callbacks].filter(fn => typeof fn === 'function');
}

function normalizePlugin(plugin) {
  if (!plugin) return null;
  plugin.hooks = plugin.hooks || {};
  plugin.enabled = plugin.enabled !== false;
  return plugin;
}

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
    this.pluginDir = path.join(__dirname);
  }

  /**
   * تحميل إضافة
   */
  async loadPlugin(plugin) {
    try {
      // إذا كانت الإضافة موجودة، قم بإلغاء تحميلها أولاً
      if (this.plugins.has(plugin.id)) {
        await this.unloadPlugin(plugin.id);
      }

      const normalizedPlugin = normalizePlugin(plugin);
      await normalizedPlugin.initialize?.();
      this.plugins.set(normalizedPlugin.id, normalizedPlugin);
      
      // تسجيل hooks من الإضافة
      for (const hookName of Object.keys(normalizedPlugin.hooks)) {
        const callbacks = normalizeHookCallbacks(normalizedPlugin.hooks[hookName]);
        if (callbacks.length === 0) continue;
        if (!this.hooks.has(hookName)) {
          this.hooks.set(hookName, []);
        }
        this.hooks.get(hookName).push({
          pluginId: normalizedPlugin.id,
          callbacks,
        });
      }

      console.log(`✅ Plugin loaded: ${normalizedPlugin.name} v${normalizedPlugin.version}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to load plugin ${plugin.id}:`, error);
      return false;
    }
  }

  /**
   * إلغاء تحميل إضافة
   */
  async unloadPlugin(pluginId) {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        console.warn(`Plugin ${pluginId} not found`);
        return false;
      }

      await plugin.shutdown?.();
      
      // إزالة hooks من الإضافة
      for (const hookName of Object.keys(plugin.hooks)) {
        const hooks = this.hooks.get(hookName);
        if (hooks) {
          this.hooks.set(hookName, hooks.filter(h => h.pluginId !== pluginId));
        }
      }

      this.plugins.delete(pluginId);
      console.log(`✅ Plugin unloaded: ${plugin.name}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to unload plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * تنفيذ hook في جميع الإضافات المسجلة
   */
  async executeHook(hookName, data = {}) {
    const hooks = this.hooks.get(hookName);
    if (!hooks || hooks.length === 0) return data;

    let result = data;
    for (const hook of hooks) {
      const plugin = this.plugins.get(hook.pluginId);
      if (plugin && plugin.enabled) {
        try {
          for (const callback of hook.callbacks) {
            result = await callback(result);
          }
        } catch (error) {
          console.error(`Hook error in ${plugin.name}:`, error);
        }
      }
    }
    return result;
  }

  /**
   * الحصول على إضافة
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  /**
   * الحصول على جميع الإضافات
   */
  getAllPlugins() {
    return Array.from(this.plugins.values()).map(p => {
      if (typeof p.getInfo === 'function') {
        return p.getInfo();
      }
      // للـ simple plugins التي لا ترث من BasePlugin
      return {
        id: p.id || 'unknown',
        name: p.name || 'Unknown Plugin',
        version: p.version || '1.0.0',
        description: p.description || '',
        enabled: p.enabled !== false,
      };
    });
  }

  /**
   * الحصول على الإضافات المفعلة
   */
  getEnabledPlugins() {
    return Array.from(this.plugins.values())
      .filter(p => p.enabled)
      .map(p => {
        if (typeof p.getInfo === 'function') {
          return p.getInfo();
        }
        // للـ simple plugins التي لا ترث من BasePlugin
        return {
          id: p.id || 'unknown',
          name: p.name || 'Unknown Plugin',
          version: p.version || '1.0.0',
          description: p.description || '',
          enabled: p.enabled !== false,
        };
      });
  }

  /**
   * تفعيل إضافة
   */
  async enablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (typeof plugin.enable === 'function') return await plugin.enable();
    plugin.enabled = true;
    await plugin.initialize?.();
    return true;
  }

  /**
   * تعطيل إضافة
   */
  async disablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (typeof plugin.disable === 'function') return await plugin.disable();
    plugin.enabled = false;
    await plugin.shutdown?.();
    return true;
  }

  /**
   * تحميل الإضافات من مجلد
   */
  async loadPluginsFromDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      const pluginFiles = files.filter(f => f.endsWith('.js') && f !== 'basePlugin.js' && f !== 'pluginManager.js' && f !== 'marketplace.js');

      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(dir, file);
          const PluginClass = require(pluginPath);

          // تحقق إذا كان class أو simple plugin
          if (typeof PluginClass === 'function' && PluginClass.prototype) {
            // Class-based plugin
            const plugin = new PluginClass();
            await this.loadPlugin(plugin);
          } else if (PluginClass && typeof PluginClass === 'object') {
            // Simple plugin (module.exports style) - تخطيها لأنها محملة بالفعل
            continue;
          }
        } catch (error) {
          console.error(`Failed to load plugin from ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load plugins from directory:', error);
    }
  }

  /**
   * الحصول على إحصائيات
   */
  getStats() {
    const allPlugins = this.getAllPlugins();
    const enabledPlugins = this.getEnabledPlugins();
    
    return {
      total: allPlugins.length,
      enabled: enabledPlugins.length,
      disabled: allPlugins.length - enabledPlugins.length,
      hooks: this.hooks.size,
      plugins: allPlugins,
    };
  }

  /**
   * الحصول على جميع مزودين AI من الإضافات المفعلة
   */
  getAllAIProviders() {
    const providers = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.aiProviders) {
        providers.push(...plugin.aiProviders);
      }
    }
    return providers;
  }
}

// إنشاء instance واحد
const pluginManager = new PluginManager();

module.exports = pluginManager;
