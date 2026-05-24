const fs = require('fs');
const path = require('path');
const { getProjectSnapshot } = require('../truthLayer');

function getConfiguredProviders(env = process.env) {
  return {
    groq: Boolean(env.GROQ_API_KEY),
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
    mistral: Boolean(env.MISTRAL_API_KEY),
    cohere: Boolean(env.COHERE_API_KEY),
    together: Boolean(env.TOGETHER_API_KEY),
  };
}

function buildRealState(projectDir = '', sessions = {}) {
  const resolvedProjectDir = projectDir ? path.resolve(projectDir) : '';
  let project = null;

  if (resolvedProjectDir && fs.existsSync(resolvedProjectDir)) {
    try {
      project = getProjectSnapshot(resolvedProjectDir);
    } catch (error) {
      project = {
        rootDir: resolvedProjectDir,
        error: error.message,
      };
    }
  }

  return {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    projectDir: resolvedProjectDir,
    project,
    sessions: {
      count: Object.keys(sessions || {}).length,
      ids: Object.keys(sessions || {}),
    },
    providers: getConfiguredProviders(),
  };
}

function validateRealState(realState) {
  const issues = [];

  if (!realState || typeof realState !== 'object') {
    return { ok: false, issues: ['state is missing'] };
  }

  if (!realState.timestamp) issues.push('timestamp is missing');
  if (!realState.process?.pid) issues.push('process pid is missing');
  if (realState.projectDir && !fs.existsSync(realState.projectDir)) {
    issues.push('projectDir does not exist');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  buildRealState,
  getConfiguredProviders,
  validateRealState,
};
