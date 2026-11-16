// DOM HUD: health, money, ammunition, round clock, team score, kill feed,
// buy panel, plant progress and the end-of-round scoreboard. The simulation
// pushes values in; the HUD never reaches back into game state.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const hpNum = el('hpNum'), hpBar = el('hpBar'), money = el('money'), ammo = el('ammo'),
    wname = el('wname'), nade = el('nade'), timer = el('timer'), roundLabel = el('roundLabel'),
    roundState = el('roundState'), scoreA = el('scoreA'), scoreF = el('scoreF'),
    bannerTitle = el('bannerTitle'), bannerSub = el('bannerSub'), feed = el('feed'),
    prog = el('prog'), progBar = el('progBar'), progLabel = el('progLabel'),
    vig = el('vig'), hitm = el('hitm'), cross = el('cross'), dmgDir = el('dmgDir'),
    buyWrap = el('buyWrap'), buyRows = el('buyRows'), buyMoney = el('buyMoney'),
    boardWrap = el('boardWrap'), boardTitle = el('boardTitle'), boardSub = el('boardSub'), boardBody = el('boardBody'),
    startWrap = el('startWrap');
  let hitTimer = 0, bannerTimer = 0, dmgTimer = 0;
  const cache = {};
  function set(key, node, value) { if (cache[key] !== value) { cache[key] = value; node.textContent = value; } }
  return {
    setHp(hp) {
      set('hp', hpNum, String(Math.max(0, Math.ceil(hp))));
      hpBar.style.width = `${Math.max(0, hp)}%`;
      hpBar.style.background = hp > 35 ? 'var(--teal)' : '#ff7847';
    },
    setMoney(v) { set('m', money, `$${v}`); set('bm', buyMoney, `$${v}`); },
    setAmmo(mag, reserve, name, grenades, smokes) {
      set('a', ammo, `${mag} / ${reserve}`);
      ammo.classList.toggle('low', mag <= Math.ceil(5));
      set('w', wname, name);
      set('n', nade, `Barnacle: ${grenades} · [G] · Smoke: ${smokes || 0} · [H]`);
    },
    setClock(seconds, phase, round, a, f) {
      const s = Math.max(0, Math.ceil(seconds));
      set('t', timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timer.classList.toggle('low', phase === 'live' && s <= 15);
      set('rs', roundState, phase.toUpperCase());
      set('rl', roundLabel, `ROUND ${round}`);
      set('sa', scoreA, String(a)); set('sf', scoreF, String(f));
    },
    setSpread(px) { cross.style.setProperty('--sp', `${Math.round(px)}px`); },
    banner(title, sub, holdMs) {
      bannerTitle.textContent = title; bannerSub.textContent = sub || '';
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { bannerTitle.textContent = ''; bannerSub.textContent = ''; }, holdMs || 2600);
    },
    // Kill feed: structured events render as killer [weapon] victim with a
    // headshot badge; plain strings still work for one-off notices. Entries
    // fade, then remove themselves so the corner never fills with history.
    feed(event) {
      const row = document.createElement('div');
      if (typeof event === 'string') {
        row.textContent = event;
      } else {
        const k = document.createElement('span'); k.className = 'kf-k'; k.textContent = event.killer;
        const w = document.createElement('span'); w.className = 'kf-w'; w.textContent = ` [${event.weapon || 'carbine'}] `;
        const v = document.createElement('span'); v.className = 'kf-v'; v.textContent = event.victim;
        row.append(k, w, v);
        if (event.headshot) {
          const h = document.createElement('span'); h.className = 'kf-h'; h.textContent = ' ⌖ HEADSHOT';
          row.append(h);
        }
      }
      feed.prepend(row);
      while (feed.children.length > 5) feed.lastChild.remove();
      setTimeout(() => { row.style.opacity = '0.35'; }, 4200);
      setTimeout(() => { row.remove(); }, 6500);
    },
    hitmarker(kill, head) {
      hitm.classList.add('on');
      hitm.classList.toggle('head', !!head);
      hitm.classList.toggle('kill', !!kill);
      hitm.style.transform = kill ? 'translate(-50%,-50%) rotate(45deg) scale(1.3)' : 'translate(-50%,-50%) rotate(45deg)';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitm.classList.remove('on', 'head', 'kill'), kill ? 320 : 110);
    },
    // Red arc at the screen centre rotated to the bearing the damage came from
    // (0deg = ahead, positive = clockwise toward the player's right).
    damageDir(deg) {
      dmgDir.style.transform = `translate(-50%,-50%) rotate(${deg}deg)`;
      dmgDir.style.opacity = '1';
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => { dmgDir.style.opacity = '0'; }, 750);
    },
    damageFlash() { vig.style.opacity = '1'; setTimeout(() => { vig.style.opacity = '0'; }, 130); },
    progress(label, frac) {
      if (frac === null) { prog.hidden = true; return; }
      prog.hidden = false; progLabel.textContent = label; progBar.style.width = `${Math.round(frac * 100)}%`;
    },
    showBuy(items, funds) {
      buyRows.innerHTML = '';
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = `buyRow${it.owned ? ' owned' : ''}${!it.owned && funds < it.price ? ' cant' : ''}`;
        row.innerHTML = `<span><kbd>${i + 1}</kbd> ${it.name} — ${it.desc}</span><b>${it.owned ? 'OWNED' : '$' + it.price}</b>`;
        buyRows.appendChild(row);
      });
      buyWrap.hidden = false;
    },
    hideBuy() { buyWrap.hidden = true; },
    showBoard(title, sub, rows) {
      boardTitle.textContent = title; boardSub.textContent = sub;
      boardBody.innerHTML = '';
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td></td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td>`;
        boardBody.appendChild(tr);
      }
      boardWrap.hidden = false;
    },
    hideBoard() { boardWrap.hidden = true; },
    showStart() { startWrap.hidden = false; },
    hideStart() { startWrap.hidden = true; },
    onPlay(fn) { el('playBtn').addEventListener('click', fn); },
  };
}
