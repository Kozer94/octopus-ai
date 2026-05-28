export const PRODUCT_TYPES = [
  { id: 'ai-agent-system', label: 'AI Agent System', icon: 'codicon-hubot' },
  { id: 'saas-platform', label: 'SaaS Platform', icon: 'codicon-organization' },
  { id: 'desktop-app', label: 'Desktop App', icon: 'codicon-device-desktop' },
  { id: 'api-backend', label: 'API Backend', icon: 'codicon-server-process' },
  { id: 'dashboard', label: 'Dashboard', icon: 'codicon-graph' },
  { id: 'automation-tool', label: 'Automation Tool', icon: 'codicon-gear' },
  { id: 'mobile-app', label: 'Mobile App', icon: 'codicon-device-mobile' },
];

export const BUILD_MODES = [
  { id: 'fast-prototype', label: 'Fast Prototype', description: 'Move quickly with a small, usable MVP.' },
  { id: 'production-grade', label: 'Production Grade', description: 'Favor reliability, tests, validation, and maintainability.' },
  { id: 'enterprise-architecture', label: 'Enterprise Architecture', description: 'Use stronger boundaries, security, auditability, and scaling patterns.' },
  { id: 'experimental', label: 'Experimental', description: 'Explore novel architecture and interaction patterns.' },
];

export const UI_STYLES = [
  'Quiet Professional',
  'Dark Technical',
  'Glassmorphism',
  'Dense Dashboard',
  'Minimal Product',
];

const STACK_PRESETS = {
  'desktop-app': {
    framework: ['Electron', 'Tauri'],
    frontend: ['React', 'Vue'],
    language: ['TypeScript', 'JavaScript'],
    storage: ['SQLite', 'Local JSON', 'Postgres'],
  },
  'saas-platform': {
    frontend: ['Next.js', 'React', 'Vue'],
    backend: ['Node.js', 'Laravel', 'NestJS'],
    database: ['Postgres', 'MySQL', 'SQLite'],
    auth: ['JWT', 'Clerk', 'Auth0', 'Firebase'],
  },
  'ai-agent-system': {
    runtime: ['Node.js Workers', 'Python Workers', 'Hybrid'],
    frontend: ['React', 'Next.js', 'Electron'],
    memory: ['SQLite', 'Vector Store', 'Postgres'],
    orchestration: ['Leg Runtime', 'Queue Workers', 'Event Bus'],
  },
  'api-backend': {
    backend: ['Node.js', 'Laravel', 'FastAPI', 'NestJS'],
    database: ['Postgres', 'MySQL', 'MongoDB', 'SQLite'],
    auth: ['JWT', 'API Keys', 'OAuth'],
  },
  dashboard: {
    frontend: ['React', 'Next.js', 'Vue'],
    charts: ['Recharts', 'ECharts', 'Native SVG'],
    data: ['REST API', 'GraphQL', 'Static JSON'],
  },
  'automation-tool': {
    runtime: ['Node.js', 'Python', 'Electron'],
    triggers: ['Manual', 'Scheduled', 'Webhook'],
    storage: ['SQLite', 'Files', 'Postgres'],
  },
  'mobile-app': {
    framework: ['React Native', 'Flutter', 'Expo'],
    backend: ['Firebase', 'Laravel', 'Node.js'],
    database: ['Firestore', 'SQLite', 'Postgres'],
  },
};

const FEATURE_PRESETS = {
  'saas-platform': ['Authentication', 'Team Workspaces', 'Billing', 'Notifications', 'Admin Dashboard', 'Audit Logs'],
  'ai-agent-system': ['Multi-Agent Runtime', 'Persistent Memory', 'Reflection Loop', 'Tool Registry', 'Execution Sandbox', 'Telemetry'],
  'desktop-app': ['Project Workspace', 'Local Runtime', 'Command Runner', 'Auto Updates', 'Settings Sync', 'Crash Recovery'],
  'api-backend': ['Authentication', 'Rate Limiting', 'OpenAPI Docs', 'Background Jobs', 'Audit Logs', 'Admin Endpoints'],
  dashboard: ['Charts', 'Filters', 'Exports', 'Role-Based Views', 'Realtime Updates', 'Analytics'],
  'automation-tool': ['Workflow Builder', 'Scheduling', 'Webhook Intake', 'Run History', 'Retry Rules', 'Notifications'],
  'mobile-app': ['Authentication', 'Offline Mode', 'Push Notifications', 'Payments', 'Profile Management', 'Analytics'],
};

const ARCHITECTURE_PRESETS = {
  'ai-agent-system': ['Agent Scheduler', 'Memory Layer', 'Tool Execution Gateway', 'Runtime Event Bus', 'Safety Validator'],
  'saas-platform': ['Tenant Boundary', 'Auth Service', 'Billing Module', 'Admin Console', 'Audit Event Stream'],
  'desktop-app': ['Shell Layer', 'IPC Bridge', 'Local Service Runtime', 'Workspace State Store', 'Update Channel'],
  'api-backend': ['Route Layer', 'Service Layer', 'Persistence Layer', 'Policy Layer', 'Observability Layer'],
  dashboard: ['Data Adapter', 'Visualization Layer', 'Filter State Store', 'Export Pipeline', 'Access Control'],
  'automation-tool': ['Trigger Layer', 'Workflow Engine', 'Worker Runtime', 'Retry Controller', 'Run Ledger'],
  'mobile-app': ['Navigation Shell', 'Local Cache', 'Sync Layer', 'Auth Boundary', 'Telemetry'],
};

export function getStackOptions(productType) {
  return STACK_PRESETS[productType] || STACK_PRESETS['desktop-app'];
}

export function getFeatureSuggestions(productType) {
  return FEATURE_PRESETS[productType] || [];
}

export function getArchitectureSuggestions(productType) {
  return ARCHITECTURE_PRESETS[productType] || [];
}

export function compileRequirementSpec({
  productType,
  stack = {},
  features = [],
  architectureMode,
  constraints = '',
  uiStyle = 'Quiet Professional',
  executionStrategy = 'guided-review',
}) {
  const product = PRODUCT_TYPES.find(item => item.id === productType) || PRODUCT_TYPES[0];
  const mode = BUILD_MODES.find(item => item.id === architectureMode) || BUILD_MODES[1];

  return {
    productType: product.id,
    productLabel: product.label,
    stack,
    features,
    architectureMode: mode.id,
    architectureLabel: mode.label,
    constraints: constraints.trim(),
    uiStyle,
    executionStrategy,
    suggestedArchitecture: getArchitectureSuggestions(product.id),
  };
}

export function buildRequirementPrompt(compiledSpec, intent = 'Build this product from the compiled requirements.') {
  const stackLines = Object.entries(compiledSpec.stack || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  const featureLines = (compiledSpec.features || []).map(feature => `- ${feature}`).join('\n') || '- None selected';
  const architectureLines = (compiledSpec.suggestedArchitecture || []).map(item => `- ${item}`).join('\n') || '- Let Octopus propose architecture';

  return [
    '[Mode: Product Manager]',
    intent,
    '',
    'Compiled Spec:',
    `Product Type: ${compiledSpec.productLabel}`,
    `Build Mode: ${compiledSpec.architectureLabel}`,
    `UI Style: ${compiledSpec.uiStyle}`,
    '',
    'Preferred Stack:',
    stackLines || '- No preference',
    '',
    'Recommended Modules:',
    featureLines,
    '',
    'Suggested Architecture:',
    architectureLines,
    '',
    'Constraints:',
    compiledSpec.constraints || '- No extra constraints',
    '',
    'Before execution, explain the interpreted requirements, identify risks, and ask only essential clarification questions. If clear, produce an execution plan using the Leg Runtime.',
  ].join('\n');
}
