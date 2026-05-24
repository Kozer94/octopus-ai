const fs = require('fs');
const path = require('path');

function loadJsonFile(filePath, fallbackValue = {}, logger = console) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    logger.error(`Error loading JSON file ${filePath}:`, error);
    return fallbackValue;
  }
}

function saveJsonFile(filePath, value, logger = console) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error saving JSON file ${filePath}:`, error);
    return false;
  }
}

function replaceObjectContents(target, source) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source || {});
  return target;
}

module.exports = {
  loadJsonFile,
  replaceObjectContents,
  saveJsonFile,
};
