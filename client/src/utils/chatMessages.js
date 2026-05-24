export const INITIAL_CHAT_MESSAGES = [
  { role: 'octopus', text: "Hello 🐙 I'm ready. Tell me what you want to build." },
];

export function userMessage(text) {
  return { role: 'user', text };
}

export function octopusMessage(text) {
  return { role: 'octopus', text };
}

export function octopusErrorMessage(error) {
  return octopusMessage(`Error: ${error}`);
}

export function octopusScanErrorMessage(error) {
  return octopusMessage(`Scan error: ${error}`);
}

export const OCTOPUS_BUSY_MESSAGE = octopusMessage('⏳ Please confirm or cancel the current plan first.');
export const OCTOPUS_CONNECT_ERROR_MESSAGE = octopusMessage('⚠️ Could not connect to server.');
export const OCTOPUS_SCANNING_MESSAGE = octopusMessage('🔍 Octopus is scanning the project and building an execution plan...');
export const OCTOPUS_CANCELLED_MESSAGE = octopusMessage('Cancelled 🐙');
export const OCTOPUS_RESET_MESSAGE = octopusMessage('Conversation cleared 🐙');
export const OCTOPUS_ABOUT_MESSAGE = octopusMessage('🐙 **Octopus AI** — AI assistant for building web applications\n\nRuns with 8 parallel legs to complete tasks fast!');
