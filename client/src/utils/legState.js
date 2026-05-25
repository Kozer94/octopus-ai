import { INITIAL_LEGS } from '../config/uiConfig.js';

export function startLeg(legs, id, task) {
  return legs.map(leg => leg.id === id ? { ...leg, status: 'working', task, progress: 0 } : leg);
}

export function advanceLegProgress(legs, id, step = 15) {
  return legs.map(leg => leg.id === id ? { ...leg, progress: Math.min(100, leg.progress + step) } : leg);
}

export function finishLeg(legs, id) {
  return legs.map(leg => leg.id === id ? { ...leg, status: 'done', progress: 100 } : leg);
}

export function applyLegUpdate(leg, update) {
  if (!update || leg.id !== update.legId) return leg;

  if (update.status === 'working') {
    const nextLeg = {
      ...leg,
      status: 'working',
      task: update.task || leg.task,
      progress: Math.max(leg.progress || 0, 5),
    };
    return isSameLegState(leg, nextLeg) ? leg : nextLeg;
  }

  if (update.status === 'done') {
    const nextLeg = { ...leg, status: 'done', progress: 100 };
    return isSameLegState(leg, nextLeg) ? leg : nextLeg;
  }

  if (update.status === 'error') {
    const nextLeg = {
      ...leg,
      status: 'error',
      task: update.error || leg.task,
      progress: 100,
    };
    return isSameLegState(leg, nextLeg) ? leg : nextLeg;
  }

  return leg;
}

export function applyLegUpdates(legs, updates = []) {
  if (!updates.length) return legs;

  const updatesById = new Map();
  updates.forEach(update => {
    if (!update?.legId) return;
    const legUpdates = updatesById.get(update.legId) || [];
    legUpdates.push(update);
    updatesById.set(update.legId, legUpdates);
  });
  if (!updatesById.size) return legs;

  let changed = false;
  const nextLegs = legs.map(leg => {
    const legUpdates = updatesById.get(leg.id) || [];
    const nextLeg = legUpdates.reduce((current, update) => applyLegUpdate(current, update), leg);
    if (nextLeg !== leg) changed = true;
    return nextLeg;
  });

  return changed ? nextLegs : legs;
}

function isSameLegState(a, b) {
  return a.status === b.status
    && a.task === b.task
    && a.progress === b.progress;
}

export function resetLegState() {
  return INITIAL_LEGS;
}
