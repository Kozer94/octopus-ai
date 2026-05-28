// Detect system language for localized greeting
function getSystemLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  if (browserLang.startsWith('ar')) return 'ar';
  if (browserLang.startsWith('ku')) return 'ku';
  return 'en';
}

export const INITIAL_CHAT_MESSAGES = [
  { 
    id: 'initial-octopus-ready', 
    role: 'octopus', 
    text: (() => {
      const lang = getSystemLanguage();
      if (lang === 'ar') return 'مرحباً 🐙 أنا جاهز. أخبرني ماذا تريد أن تبني.';
      if (lang === 'ku') return 'سڵاو 🐙 ئامان. بڵیمن بکە دەتەوێت چی دروست بکەیت.';
      return "Hello 🐙 I'm ready. Tell me what you want to build.";
    })()
  },
];

function createMessageId(role) {
  const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${role}_${Date.now()}_${randomPart}`;
}

export function userMessage(text) {
  return { id: createMessageId('user'), role: 'user', text };
}

export function octopusMessage(text, extra = {}) {
  return { id: createMessageId('octopus'), role: 'octopus', text, ...extra };
}

export function octopusErrorMessage(error) {
  return octopusMessage(`Error: ${error}`);
}

export function octopusScanErrorMessage(error) {
  return octopusMessage(`Scan error: ${error}`);
}

export function octopusRateLimitMessage(resetAt) {
  if (resetAt) {
    const seconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return octopusMessage(`⏱️ Too many requests. Please wait ${seconds}s before trying again.`);
  }
  return octopusMessage('⏱️ Too many requests. Please wait a moment before trying again.');
}

export const OCTOPUS_SLOW_MESSAGE = octopusMessage('⏳ Still working... AI providers are busy. This may take up to 90s.');
export const OCTOPUS_TIMEOUT_MESSAGE = octopusMessage('⚠️ Request timed out. The AI providers are overloaded — please try again.');
export const OCTOPUS_BUSY_MESSAGE = octopusMessage('⏳ Please confirm or cancel the current plan first.');
export const OCTOPUS_CONNECT_ERROR_MESSAGE = octopusMessage('⚠️ Could not connect to server.');
export const OCTOPUS_SCANNING_MESSAGE = octopusMessage('🔍 Octopus is scanning the project and building an execution plan...');
export const OCTOPUS_CANCELLED_MESSAGE = octopusMessage('Cancelled 🐙');
export const OCTOPUS_RESET_MESSAGE = octopusMessage('Conversation cleared 🐙');
export const OCTOPUS_ABOUT_MESSAGE = octopusMessage('🐙 **Octopus AI** — AI assistant for building web applications\n\nRuns with 8 parallel legs to complete tasks fast!');
