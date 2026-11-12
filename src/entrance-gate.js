'use strict';
// Decides whether an input event should leave the entrance screen.
// The first real click, pointer, or key enters. Repeats and later events do not.
function shouldDismissEntrance(ev, alreadyDone) {
  if (alreadyDone) return false;
  if (!ev) return true;
  const type = ev.type;
  if (type === 'keydown') return !ev.repeat;
  return type === 'click' || type === 'pointerdown' || type === 'mousedown';
}

const entranceGateApi = { shouldDismissEntrance };
if (typeof module !== 'undefined' && module.exports) module.exports = entranceGateApi;
if (typeof window !== 'undefined') window.shouldDismissEntrance = shouldDismissEntrance;
