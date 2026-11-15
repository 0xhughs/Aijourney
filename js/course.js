/* Course logic: unlocking, progress, completion. Pure functions over COURSE_DATA + Store. */
(function () {
  'use strict';
  const data = () => window.COURSE_DATA || { units: [] };

  function units() { return data().units; }
  function unit(id) { return units().find(u => u.id === id) || null; }
  function coreUnits() { return units().filter(u => u.track === 'core'); }
  function advancedUnits() { return units().filter(u => u.track === 'advanced'); }

  function lessonStages(u) { return u.stages.filter(s => s.kind === 'lesson'); }
  function bonusStages(u) { return u.stages.filter(s => s.kind === 'bonus'); }

  function isCertified(unitId, p) {
    p = p || Store.active(); if (!p) return false;
    const st = p.units[unitId];
    return !!(st && st.certificate);
  }

  // Advanced units unlock only after every core unit is certified (prerequisites per INDEX_AR / unit files).
  function unitPrereqs(u) { return u.track === 'advanced' ? coreUnits().map(c => c.id) : []; }
  function unitUnlocked(u, p) {
    return unitPrereqs(u).every(id => isCertified(id, p));
  }
  function missingPrereqs(u, p) { return unitPrereqs(u).filter(id => !isCertified(id, p)); }

  function stageDone(unitId, stageId, p) {
    p = p || Store.active(); if (!p) return false;
    const st = p.units[unitId];
    return !!(st && st.stages[stageId] && st.stages[stageId].done);
  }

  // Sequential unlock: a lesson stage unlocks when the previous lesson stage is done.
  // A bonus stage unlocks when the lesson stage right before it is done; bonus never blocks progress.
  function stageStatus(u, stage, p) {
    if (stageDone(u.id, stage.id, p)) return 'done';
    const idx = u.stages.indexOf(stage);
    let prevLesson = null;
    for (let i = idx - 1; i >= 0; i--) if (u.stages[i].kind === 'lesson') { prevLesson = u.stages[i]; break; }
    if (!prevLesson || stageDone(u.id, prevLesson.id, p)) return stage.kind === 'bonus' ? 'open' : 'current';
    return 'locked';
  }

  function assessmentUnlocked(u, p) { return lessonStages(u).every(s => stageDone(u.id, s.id, p)); }

  function componentState(unitId, compId, p) {
    p = p || Store.active(); if (!p) return null;
    const st = p.units[unitId];
    return st && st.assessment.components[compId] || null;
  }
  function assessmentPassed(u, p) {
    return u.assessment.components.every(c => { const s = componentState(u.id, c.id, p); return s && s.passed; });
  }

  function unitProgress(u, p) {
    const ls = lessonStages(u);
    const doneL = ls.filter(s => stageDone(u.id, s.id, p)).length;
    const comps = u.assessment.components.length;
    const doneC = u.assessment.components.filter(c => { const s = componentState(u.id, c.id, p); return s && s.passed; }).length;
    const total = ls.length + comps;
    return {
      lessonsDone: doneL, lessons: ls.length, compsDone: doneC, comps,
      ratio: total ? (doneL + doneC) / total : 0,
      certified: isCertified(u.id, p),
      started: doneL > 0 || doneC > 0,
      bonusDone: bonusStages(u).filter(s => stageDone(u.id, s.id, p)).length,
      bonus: bonusStages(u).length,
    };
  }

  function nextStage(u, p) {
    return u.stages.find(s => s.kind === 'lesson' && stageStatus(u, s, p) === 'current') || null;
  }

  window.Course = {
    units, unit, coreUnits, advancedUnits, lessonStages, bonusStages, unitUnlocked, missingPrereqs,
    stageStatus, stageDone, assessmentUnlocked, assessmentPassed, componentState, unitProgress, nextStage, isCertified,
  };
})();
