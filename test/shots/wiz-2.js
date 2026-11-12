(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const $ = s => document.querySelector(s);
  const steps = 2; $('#askLog').click(); await w(450);
  const fill = { 1: () => {}, 2: () => { $('#wDir .choice').click(); [...document.querySelectorAll('#wSetup .pick')][0].click(); },
    3: () => { for (const [s, v] of [['#wEntry','21390'],['#wStop','21376'],['#wTarget','21460']]) { $(s).value = v; $(s).dispatchEvent(new Event('input')); } },
    4: () => { [...document.querySelectorAll('#wRq .pick')].find(b => b.dataset.v === '5').click(); $('#wPnl').value = '350'; $('#wPnl').dispatchEvent(new Event('input')); },
    5: () => { $('#wAllKept').click(); }, 6: () => { ['Calm','Patient','Focused'].forEach(e => [...document.querySelectorAll('#wEmo .pick')].find(b => b.dataset.v === e).click()); $('#wNotes').value = 'Swept the 6am high, CISD on the 1m. Waited for the candle close.'; $('#wNotes').dispatchEvent(new Event('input')); }, 7: () => {} };
  for (let i = 1; i < steps; i++) { fill[i](); $('#wizNext').click(); await w(120); }
  if (steps === 2 || steps === 5 || steps === 6) fill[steps]();
  if (steps === 5) { document.querySelectorAll('#wRules .rule')[0].click(); document.querySelectorAll('#wRules .rule')[0].click(); }
  document.activeElement && document.activeElement.blur(); return true; })()
