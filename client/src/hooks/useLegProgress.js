import { useState } from 'react';
import { INITIAL_LEGS } from '../config/uiConfig';
import { advanceLegProgress, finishLeg, resetLegState, startLeg } from '../utils/legState';

export function useLegProgress() {
  const [legs, setLegs] = useState(INITIAL_LEGS);

  function activateLeg(id, task) {
    setLegs(prev => startLeg(prev, id, task));
    const interval = setInterval(() => {
      setLegs(prev => {
        const leg = prev.find(l => l.id === id);
        if (!leg || leg.progress >= 100) {
          clearInterval(interval);
          return prev;
        }
        return advanceLegProgress(prev, id);
      });
    }, 200);
  }

  function completeLeg(id) {
    setLegs(prev => finishLeg(prev, id));
  }

  function resetLegs() {
    setLegs(resetLegState());
  }

  return {
    activateLeg,
    completeLeg,
    legs,
    resetLegs,
    setLegs,
  };
}
