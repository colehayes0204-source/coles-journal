// Runs inside the real renderer: logs a trade through the guided wizard, then edits/filters/deletes it.
(async () => {
  const out = {}; const wait = ms => new Promise(r => setTimeout(r, ms)); const $ = s => document.querySelector(s);
  const click = s => $(s).click(); const type = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new Event('input')); };
  const before = (await gon.logs.list()).length, streakBefore = (await gon.logs.stats()).rules.current;
  out.greeting = $('#greeting').textContent.includes('Hello');
  click('#askLog'); await wait(400);
  out.wizardOpen = !$('#wizOverlay').hidden && $('#wizStepLbl').textContent === 'Step 1 of 8';
  type('#wInstOther', ''); [...document.querySelectorAll('#wInst .pick')].find(b => b.dataset.v === 'MES').click();
  type('#wDate', '2026-11-12'); click('#wizNext'); await wait(250);
  click('#wizNext'); await wait(250); out.blocksWithoutDirection = $('#wErr').textContent.length > 0;
  click('#wDir .choice.short'); click('#wSetup .pick'); click('#wizNext'); await wait(250);
  type('#wEntry', '5930'); type('#wStop', '5934'); type('#wTarget', '5910'); out.plannedRR = $('#wRR').textContent.includes('5.00R'); click('#wizNext'); await wait(250);
  [...document.querySelectorAll('#wRq .pick')].find(b => b.dataset.v === '5').click(); type('#wPnl', '250'); click('#wizNext'); await wait(250);
  click('#wizNext'); await wait(200); out.rulesRequired = $('#wErr').textContent.includes('Mark every rule');
  click('#wAllKept'); await wait(100); out.verdictKept = !!$('.rules-verdict.kept'); click('#wizNext'); await wait(250);
  [...document.querySelectorAll('#wEmo .pick')].find(b => b.dataset.v === 'Calm').click(); type('#wNotes', 'E2E wizard trade'); click('#wizNext'); await wait(250);
  click('#wizNext'); await wait(250); out.reviewShown = $('.review') && $('.review').textContent.includes('MES');
  click('#wizNext'); await wait(1800);
  const logs = await gon.logs.list(), made = logs.find(l => l.notes === 'E2E wizard trade');
  out.created = !!made && made.instrument === 'MES' && made.direction === 'short' && made.resultR === 5 && made.pnl === 250 && made.followedPlan === true && made.emotions.includes('Calm') && made.setup === '10am H6 sweep + CISD' && logs.length === before + 1;
  out.streakGrew = (await gon.logs.stats()).rules.current === streakBefore + 1;
  document.querySelector('[data-tab=logs]').click(); await wait(400);
  document.querySelector(`#logList tr[data-id="${made.id}"]`).click(); await wait(400);
  document.querySelectorAll('#drawerRules .rule')[0].click(); await wait(50);   // mark rule 1 broken
  $('#logForm').elements.resultR.value = '-1'; $('#logForm').requestSubmit(); await wait(700);
  const ed = (await gon.logs.list()).find(l => l.id === made.id);
  out.editedWithBrokenRule = ed.resultR === -1 && ed.followedPlan === false && ed.rulesBroken.length === 1;
  out.streakReset = (await gon.logs.stats()).rules.current === 0;
  type('#fSearch', 'E2E wizard'); await wait(100); out.filterWorks = document.querySelectorAll('#logList tbody tr').length === 1;
  window.confirm = () => true;
  document.querySelector(`#logList tr[data-id="${made.id}"]`).click(); await wait(400); click('#deleteLog'); await wait(700);
  out.deleted = (await gon.logs.list()).length === before;
  out.streakRestored = (await gon.logs.stats()).rules.current === streakBefore;
  document.querySelector('[data-tab=logs]').click(); type('#fSearch', ''); document.querySelector('#logMode [data-mode=calendar]').click(); await wait(300);
  out.calendarRuleMarks = document.querySelectorAll('#logCal .rmark').length > 0;
  document.querySelector('[data-tab=mentors]').click(); await wait(500);
  out.mentorFeedCards = document.querySelectorAll('#feed .post').length;
  out.noPromptText = !/@journal|\$ |--step/.test(document.body.innerText);
  out.allPassed = Object.entries(out).every(([k, v]) => k === 'mentorFeedCards' ? v === 4 : v === true);
  return out;
})()
