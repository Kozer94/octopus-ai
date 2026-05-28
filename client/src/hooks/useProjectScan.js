import { scanApi } from '../services/apiClient';
import { octopusMessage } from '../utils/chatMessages';

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

export function useProjectScan({ currentDir, refreshFileTree, setMessages }) {
  async function handleScan() {
    if (!currentDir) {
      setMessages(prev => [...prev, octopusMessage('⚠️ افتح مجلد مشروع أولاً لتشغيل الفحص.')]);
      return;
    }
    setMessages(prev => [...prev, octopusMessage('🔍 جاري فحص المشروع... (بدون AI tokens)')]);
    try {
      const data = await scanApi.scan(currentDir);
      if (data.success) {
        const stats = data.stats || {};
        const lines = formatCount(stats.totalLines);
        const frameworks = Array.isArray(stats.frameworks) ? stats.frameworks.join(', ') : '—';
        setMessages(prev => [...prev, octopusMessage(`✅ تم الفحص وكُتب report.md\n\n📊 ${formatCount(stats.totalFiles)} ملف • ${lines} سطر • ${formatCount(stats.totalSizeKB)} KB\n🔧 ${frameworks || 'لا أطر مكتشفة'}\n🌐 ${formatCount(stats.routesFound)} route مكتشف`)]);
        refreshFileTree();
      } else {
        setMessages(prev => [...prev, octopusMessage(`❌ فشل الفحص: ${data.error}`)]);
      }
    } catch (err) {
      setMessages(prev => [...prev, octopusMessage(`❌ خطأ: ${err.message}`)]);
    }
  }

  return { handleScan };
}
