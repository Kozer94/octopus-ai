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

export function resetLegState() {
  return INITIAL_LEGS;
}
