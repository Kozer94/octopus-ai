import { scanApi } from '../services/apiClient';

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

export function useProjectScan({ currentDir, refreshFileTree, setMessages }) {
  async function handleScan() {
    if (!currentDir) {
      setMessages(prev => [...prev, { role: 'octopus', text: '⚠️ افتح مجلد مشروع أولاً لتشغيل الفحص.' }]);
      return;
    }
    setMessages(prev => [...prev, { role: 'octopus', text: '🔍 جاري فحص المشروع... (بدون AI tokens)' }]);
    try {
      const data = await scanApi.scan(currentDir);
      if (data.success) {
        const stats = data.stats || {};
        const lines = formatCount(stats.totalLines);
        const frameworks = Array.isArray(stats.frameworks) ? stats.frameworks.join(', ') : '—';
        setMessages(prev => [...prev, {
          role: 'octopus',
          text: `✅ تم الفحص وكُتب report.md\n\n📊 ${formatCount(stats.totalFiles)} ملف • ${lines} سطر • ${formatCount(stats.totalSizeKB)} KB\n🔧 ${frameworks || 'لا أطر مكتشفة'}\n🌐 ${formatCount(stats.routesFound)} route مكتشف`,
        }]);
        refreshFileTree();
      } else {
        setMessages(prev => [...prev, { role: 'octopus', text: `❌ فشل الفحص: ${data.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'octopus', text: `❌ خطأ: ${err.message}` }]);
    }
  }

  return { handleScan };
}
