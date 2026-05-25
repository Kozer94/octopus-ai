const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const EVENT_LOG_SCHEMA_VERSION = 1;

function appendEventLog(eventLogPath, event, logger = console) {
  fsp.mkdir(path.dirname(eventLogPath), { recursive: true })
    .then(() => fsp.appendFile(eventLogPath, `${JSON.stringify(event)}\n`, 'utf8'))
    .catch((error) => {
      logger.error(`Error appending event log ${eventLogPath}:`, error);
    });
  return true;
}

function readEventLog(eventLogPath, logger = console) {
  try {
    if (!fs.existsSync(eventLogPath)) return [];
    return fs.readFileSync(eventLogPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  } catch (error) {
    logger.error(`Error reading event log ${eventLogPath}:`, error);
    return [];
  }
}

module.exports = {
  EVENT_LOG_SCHEMA_VERSION,
  appendEventLog,
  readEventLog,
};
