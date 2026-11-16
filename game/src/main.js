// HARBORLINE BREACH — boot, round state machine and the fixed-step loop.
// The Harbour Watch (you plus two bots) attack across a dusk container yard;
// the Rust Syndicate (three bots) defend two plant sites. Rounds are won by
// elimination, by detonating the planted charge, or — for the defence — by
// defusing it or running the clock out.
// ?shot=start|play|end&seed=N stages one deterministic still scene instead.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { PALETTE } from './palette.js';
import { createAudio } from './audio.js';
import { createWorld, SITES, ATTACK_SPAWN, DEFEND_SPAWNS, ALLY_SPAWNS } from './world.js';
import { WEAPONS, BUY_ORDER, GRENADE_PRICE, GRENADE_DAMAGE, GRENADE_RADIUS, spreadFor, buildViewModel, createLoadout } from './weapons.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const BUY_TIME = 9;
const ROUND_TIME = 100;
const PLANT_TIME = 25;
const PLANT_CHANNEL = 3;
const DEFUSE_CHANNEL = 4.5;
const WIN_SCORE = 6;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed * 7919 + 101);
const playRng = shotMode ? rng : makeRng((Date.now() % 100000) + 7);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const hud = createHud();
const player = createPlayer(world.colliders, ATTACK_SPAWN);
const loadout = createLoadout();
const view = buildViewModel(camera);
const bots = createBots(scene, playRng);
bots.spawnAll(ALLY_SPAWNS, DEFEND_SPAWNS);
const raycaster = new THREE.Raycaster();

// ---- tracers: a small reused pool of glowing lines -------------------------
const tracerPool = [];
for (let i = 0; i < 28; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.charge), transparent: true, opacity: 0 }));
  line.visible = false; line.frustumCulled = false;
  scene.add(line);
  tracerPool.push({ line, ttl: 0 });
}
let tracerIdx = 0;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function tracer(from, to, color) {
  const t = tracerPool[tracerIdx++ % tracerPool.length];
  const p = t.line.geometry.attributes.position;
  p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, to.x, to.y, to.z); p.needsUpdate = true;
  t.line.material.color.set(color || PALETTE.charge);
  t.line.material.opacity = 0.85; t.line.visible = true; t.ttl = 0.07;
}

// ---- grenades ---------------------------------------------------------------
const grenades = [];
const nadeMeshProto = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5 }));
function throwGrenade() {
  if (loadout.state.grenades <= 0 || !player.state.alive) return;
  loadout.state.grenades -= 1;
  const mesh = nadeMeshProto.clone();
  mesh.position.copy(camera.position);
  scene.add(mesh);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  grenades.push({ mesh, vel: dir.multiplyScalar(13).add(new THREE.Vector3(0, 3.4, 0)), fuse: 1.6 });
  audio.throwWhoosh();
}
function explodeNade(g) {
  audio.boom();
  tracer(g.mesh.position, tmpA.set(g.mesh.position.x, g.mesh.position.y + 0.4, g.mesh.position.z), PALETTE.dusk);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.pos.distanceTo(g.mesh.position);
    if (d < GRENADE_RADIUS) {
      const dmg = Math.round(GRENADE_DAMAGE * (1 - d / (GRENADE_RADIUS + 1)));
      if (bots.damage(bot, dmg)) onKill('You', bot, { weapon: 'Barnacle Grenade' });
    }
  }
  const dp = player.state.pos.distanceTo(g.mesh.position);
  if (player.state.alive && dp < GRENADE_RADIUS) hurtPlayer(Math.round(GRENADE_DAMAGE * 0.4 * (1 - dp / (GRENADE_RADIUS + 1))), 'Barnacle blast', { fromPos: g.mesh.position, weapon: 'Barnacle Grenade' });
  scene.remove(g.mesh);
}

// ---- shared target descriptors for bot perception ---------------------------
const playerDesc = { isPlayer: true, pos: player.state.pos, alive: false, speed: 0 };
const botDescs = bots.bots.map((b) => ({ bot: b, pos: b.pos, alive: true, speed: 2 }));
function targetsOf(bot) {
  return bot.team === 'ally' ? botDescs.filter((d) => d.bot.team === 'foe') : [playerDesc, ...botDescs.filter((d) => d.bot.team === 'ally')];
}

// ---- match state --------------------------------------------------------------
const S = {
  started: false, phase: 'buy', phaseLeft: BUY_TIME, round: 1,
  winsA: 0, winsF: 0, money: 800,
  planted: false, plantSite: null, plantLeft: 0, plantProgress: 0, defuseProgress: 0,
  beepTimer: 0, overInfo: '',
};
const stats = new Map();
function stat(name) { if (!stats.has(name)) stats.set(name, { k: 0, d: 0 }); return stats.get(name); }
stat('You'); for (const b of bots.bots) stat(b.name);
let playerAliveLastRound = true;

function boardRows() {
  const left = ['You', ...bots.allies().map((b) => b.name)];
  const right = bots.foes().map((b) => b.name);
  const rows = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i], r = right[i];
    rows.push([l || '', l ? stat(l).k : '', l ? stat(l).d : '', r || '', r ? stat(r).k : '', r ? stat(r).d : '']);
  }
  return rows;
}
function buyItems() {
  const items = BUY_ORDER.map((id) => {
    const w = WEAPONS[id];
    return { id, name: w.name, desc: `DMG ${w.damage}${w.pellets > 1 ? ' x' + w.pellets : ''} · MAG ${w.mag}${w.auto ? ' · AUTO' : ''}`, price: w.price, owned: !!loadout.state.owned[id] };
  });
  items.push({ id: 'grenade', name: 'Barnacle Grenade', desc: `DMG ${GRENADE_DAMAGE} · blast ${GRENADE_RADIUS}m · throw with G`, price: GRENADE_PRICE, owned: loadout.state.grenades > 0 });
  return items;
}
function tryBuy(index) {
  const items = buyItems();
  const it = items[index];
  if (!it) return;
  if (it.id === 'grenade') {
    if (S.money < GRENADE_PRICE) { audio.denied(); return; }
    S.money -= GRENADE_PRICE; loadout.state.grenades += 1; audio.buy();
  } else {
    if (loadout.state.owned[it.id]) { loadout.equip(it.id); audio.buy(); }
    else if (S.money >= it.price) { S.money -= it.price; loadout.buy(it.id); audio.buy(); }
    else { audio.denied(); return; }
  }
  hud.setMoney(S.money);
  hud.showBuy(buyItems(), S.money);
  syncAmmoHud();
}

// ---- combat -------------------------------------------------------------------
// Bots all carry the yard-standard carbine; the feed names it so a bot kill
// reads the same as a player kill.
const BOT_WEAPON = 'Carbine Tern-4';
function hurtPlayer(dmg, sourceName, opts) {
  if (!player.state.alive || dmg <= 0) return;
  player.state.hp -= dmg;
  hud.setHp(player.state.hp);
  hud.damageFlash(); audio.hurt();
  // Damage-direction arc: bearing of the source relative to the player's view.
  if (opts && opts.fromPos) {
    const dx = opts.fromPos.x - player.state.pos.x;
    const dz = opts.fromPos.z - player.state.pos.z;
    const sin = Math.sin(player.state.yaw), cos = Math.cos(player.state.yaw);
    const fwd = dx * -sin + dz * -cos;
    const rgt = dx * cos + dz * -sin;
    hud.damageDir(Math.atan2(rgt, fwd) * 180 / Math.PI);
  }
  if (player.state.hp <= 0) {
    player.state.alive = false;
    stat('You').d += 1;
    hud.feed({ killer: sourceName, victim: 'You', weapon: opts && opts.weapon, headshot: !!(opts && opts.headshot) });
    hud.banner('You are down', 'Your crew fights on — the round still counts.', 2400);
  }
}
function onKill(killerName, bot, opts) {
  stat(bot.name).d += 1;
  if (killerName === 'You') { stat('You').k += 1; S.money += 300; hud.setMoney(S.money); }
  else stat(killerName).k += 1;
  hud.feed({ killer: killerName, victim: bot.name, weapon: opts && opts.weapon, headshot: !!(opts && opts.headshot) });
}
function onBotShot(bot, target, hit, dmg, head) {
  tmpA.set(bot.pos.x, 1.35, bot.pos.z);
  tmpB.copy(target.pos); tmpB.y = 1.2;
  if (!hit) { tmpB.x += playRng.range(-1.4, 1.4); tmpB.y += playRng.range(-0.4, 0.9); tmpB.z += playRng.range(-1.4, 1.4); }
  tracer(tmpA, tmpB, bot.team === 'ally' ? PALETTE.ally : PALETTE.foe);
  if (bot.team === 'foe') audio.foeShot();
  if (!hit) return;
  if (target.isPlayer) hurtPlayer(dmg, bot.name, { fromPos: bot.pos, weapon: BOT_WEAPON, headshot: head });
  else if (bots.damage(target.bot, dmg)) onKill(bot.name, target.bot, { weapon: BOT_WEAPON, headshot: head });
}

const shootDir = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();
function playerShoot() {
  const def = loadout.def();
  loadout.consume();
  audio.shot(def.sound);
  player.recoil(def.kick + playRng.next() * def.kick * 0.5, (playRng.next() * 2 - 1) * def.kick * 0.4);
  const spread = spreadFor(def, player.speed(), player.state.crouching, player.state.airTime);
  const shootables = world.shootables.concat(bots.hitMeshes);
  let anyHit = false, anyKill = false, anyHead = false;
  for (let p = 0; p < def.pellets; p++) {
    camera.getWorldDirection(shootDir);
    shootDir.x += (playRng.next() * 2 - 1) * spread;
    shootDir.y += (playRng.next() * 2 - 1) * spread;
    shootDir.z += (playRng.next() * 2 - 1) * spread;
    shootDir.normalize();
    shootOrigin.copy(camera.position);
    raycaster.set(shootOrigin, shootDir);
    raycaster.far = def.range + 20;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : tmpB.copy(shootOrigin).addScaledVector(shootDir, def.range);
    tracer(tmpA.copy(shootOrigin).addScaledVector(shootDir, 0.7), end, PALETTE.charge);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      if (bot.alive && hit.distance <= def.range) {
        const isHead = hit.object.userData.part === 'head';
        const fall = hit.distance > def.range * 0.6 ? 0.7 : 1;
        const dmg = Math.round(def.damage * (isHead ? def.headMult : 1) * fall);
        const killed = bots.damage(bot, dmg);
        anyHit = true; anyKill = anyKill || killed; anyHead = anyHead || isHead;
        audio.hit(isHead);
        if (killed) onKill('You', bot, { weapon: def.name, headshot: isHead });
      }
    }
  }
  if (anyHit) hud.hitmarker(anyKill, anyHead);
  syncAmmoHud();
}
function syncAmmoHud() {
  const d = loadout.def();
  hud.setAmmo(loadout.state.mag, loadout.state.reserve, d.name, loadout.state.grenades);
}

// ---- round flow -----------------------------------------------------------------
function assignGoals() {
  const site = S.round % 2 === 0 ? SITES.B : SITES.A;
  for (const ally of bots.allies()) {
    ally.goal = new THREE.Vector3(site.pos.x + playRng.range(-3, 3), 0, site.pos.z + playRng.range(-3, 3));
    ally.onArrive = (b) => { b.goal = null; };
  }
  const posts = [SITES.A.pos, SITES.B.pos, new THREE.Vector3(4, 0, -2)];
  bots.foes().forEach((foe, i) => {
    const post = posts[i % posts.length];
    foe.goal = new THREE.Vector3(post.x + playRng.range(-2.5, 2.5), 0, post.z + playRng.range(-2.5, 2.5));
    foe.onArrive = (b) => { b.goal = null; };
  });
}
function startRound() {
  loadout.resetRound(playerAliveLastRound);
  bots.resetAll(ALLY_SPAWNS, DEFEND_SPAWNS);
  player.reset(ATTACK_SPAWN);
  S.planted = false; S.plantSite = null; S.plantProgress = 0; S.defuseProgress = 0;
  world.chargeGroup.visible = false;
  S.phase = 'buy'; S.phaseLeft = BUY_TIME;
  hud.hideBoard(); hud.setHp(100); hud.setMoney(S.money); syncAmmoHud();
  hud.banner(`Round ${S.round} — buy phase`, 'Harbour Watch attack. Plant on Site A (north) or Site B (south).', 2400);
  if (!shotMode) hud.showBuy(buyItems(), S.money);
}
function endRound(attackersWon, why) {
  S.phase = 'over'; S.phaseLeft = 6;
  S.overInfo = why;
  if (attackersWon) { S.winsA += 1; S.money += 1400; } else { S.winsF += 1; S.money += 900; }
  playerAliveLastRound = player.state.alive;
  audio.roundEnd(attackersWon);
  hud.hideBuy(); hud.progress(null);
  hud.banner(attackersWon ? 'Harbour Watch takes the round' : 'Rust Syndicate holds the yard', why, 3600);
  hud.showBoard(attackersWon ? 'Round to the Harbour Watch' : 'Round to the Rust Syndicate', why, boardRows());
  hud.setMoney(S.money);
}
function checkRoundEnd() {
  const foesAlive = bots.aliveCount('foe');
  const attackAlive = bots.aliveCount('ally') + (player.state.alive ? 1 : 0);
  if (foesAlive === 0) { endRound(true, 'Rust Syndicate eliminated.'); return true; }
  if (attackAlive === 0 && !S.planted) { endRound(false, 'Harbour Watch eliminated before the plant.'); return true; }
  if (attackAlive === 0 && S.planted && S.defuseProgress <= 0) { /* charge still decides it */ }
  return false;
}

// ---- per-step simulation ---------------------------------------------------------
const keys = new Set();
let firing = false;
function step(dt) {
  for (const t of tracerPool) if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.14) { g.mesh.position.y = 0.14; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    g.fuse -= dt;
    if (g.fuse <= 0) { explodeNade(g); grenades.splice(i, 1); }
  }
  loadout.step(dt);
  view.group.position.z = -0.45 + loadout.state.kick;
  view.group.rotation.x = loadout.state.kick * 2;
  view.flash.visible = loadout.state.flashLeft > 0;
  view.light.intensity = loadout.state.flashLeft > 0 ? 14 : 0;

  if (S.phase === 'buy') {
    S.phaseLeft -= dt;
    player.step(dt, keys, true);
    if (S.phaseLeft <= 0) {
      S.phase = 'live'; S.phaseLeft = ROUND_TIME;
      hud.hideBuy(); assignGoals();
      hud.banner('Live round', 'Plant the charge or clear the yard.', 1800);
    }
  } else if (S.phase === 'live') {
    S.phaseLeft -= dt;
    player.step(dt, keys, false);
    if (firing && player.state.alive && loadout.ready()) playerShoot();
    // Refresh bot perception descriptors.
    playerDesc.alive = player.state.alive;
    playerDesc.speed = player.speed();
    for (const d of botDescs) { d.alive = d.bot.alive; d.speed = d.bot.mode === 'engage' ? 1.3 : 2.6; }
    bots.step(dt, { colliders: world.colliders, worldShootables: world.shootables, raycaster, rng: playRng, targetsOf, onBotShot });
    // Planting by the player.
    if (!S.planted && player.state.alive) {
      const nearSite = [SITES.A, SITES.B].find((s) => player.state.pos.distanceTo(s.pos) <= s.radius);
      if (nearSite && keys.has('KeyE')) {
        S.plantProgress += dt / PLANT_CHANNEL;
        hud.progress(`Planting charge on ${nearSite === SITES.A ? 'Site A' : 'Site B'}…`, S.plantProgress);
        if (S.plantProgress >= 1) {
          S.planted = true; S.plantSite = nearSite; S.plantLeft = PLANT_TIME; S.beepTimer = 0;
          world.chargeGroup.position.copy(player.state.pos);
          world.chargeGroup.visible = true;
          S.money += 300; hud.setMoney(S.money);
          audio.plant();
          hud.banner('Charge planted', `Detonation in ${PLANT_TIME} seconds — hold the site!`, 2200);
          hud.progress(null);
          for (const foe of bots.foes()) if (foe.alive) { foe.goal = world.chargeGroup.position.clone(); foe.onArrive = null; }
          for (const ally of bots.allies()) if (ally.alive) { ally.goal = new THREE.Vector3(nearSite.pos.x + playRng.range(-4, 4), 0, nearSite.pos.z + playRng.range(-4, 4)); ally.onArrive = (b) => { b.goal = null; }; }
        }
      } else {
        S.plantProgress = Math.max(0, S.plantProgress - dt * 0.7);
        hud.progress(null);
      }
    }
    // Planted-charge resolution.
    if (S.planted) {
      S.plantLeft -= dt;
      S.beepTimer -= dt;
      if (S.beepTimer <= 0) { S.beepTimer = Math.max(0.18, S.plantLeft / PLANT_TIME * 0.9); audio.beep(S.plantLeft < 3); world.chargeLamp.material.color.set(PALETTE.foe); setTimeout(() => world.chargeLamp.material.color.set(PALETTE.charge), 90); }
      const foeNear = bots.foes().some((f) => f.alive && f.pos.distanceTo(world.chargeGroup.position) < 2.4);
      if (foeNear) {
        S.defuseProgress += dt / DEFUSE_CHANNEL;
        hud.progress('Rust Syndicate is defusing!', S.defuseProgress);
        if (S.defuseProgress >= 1) { endRound(false, 'The charge was defused.'); }
      } else {
        S.defuseProgress = Math.max(0, S.defuseProgress - dt * 0.4);
        if (!checkRoundEnd()) hud.progress(null);
      }
      if (S.phase === 'live' && S.plantLeft <= 0) { audio.boom(); endRound(true, 'The charge detonated on site.'); }
    } else if (S.phase === 'live') {
      if (!checkRoundEnd() && S.phaseLeft <= 0) endRound(false, 'Time expired with no plant — defence holds.');
    }
    if (S.phase === 'live') checkRoundEnd();
  } else if (S.phase === 'over') {
    S.phaseLeft -= dt;
    player.step(dt, keys, true);
    if (S.phaseLeft <= 0) {
      if (S.winsA >= WIN_SCORE || S.winsF >= WIN_SCORE || S.round >= 11) {
        hud.showBoard(S.winsA > S.winsF ? 'MATCH — Harbour Watch wins the harbour' : 'MATCH — Rust Syndicate keeps the harbour',
          `Final score ${S.winsA} — ${S.winsF}. Restarting a fresh match…`, boardRows());
        S.winsA = 0; S.winsF = 0; S.round = 1; S.money = 800;
        for (const n of stats.keys()) stats.set(n, { k: 0, d: 0 });
        playerAliveLastRound = true;
      } else S.round += 1;
      startRound();
    }
  }
  const clockPhase = S.phase === 'live' && S.planted ? 'live' : S.phase;
  hud.setClock(S.planted && S.phase === 'live' ? S.plantLeft : S.phaseLeft, clockPhase, S.round, S.winsA, S.winsF);
  hud.setSpread(4 + player.speed() * 2.2 + loadout.state.kick * 160);
}

// ---- camera & loop ------------------------------------------------------------------
let camOverride = null;
function syncCamera() {
  if (camOverride) { camera.position.copy(camOverride.pos); camera.lookAt(camOverride.look); return; }
  const p = player.state;
  const eyeY = p.alive ? p.eye : 0.5;
  camera.position.set(p.pos.x, eyeY, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}
let acc = 0, last = performance.now(), frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (!frozen) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n += 1; }
    if (acc > STEP * 5) acc = 0;
  }
  syncCamera();
  renderer.render(scene, camera);
}

// ---- input ----------------------------------------------------------------------------
const canvas = renderer.domElement;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && S.started && !shotMode) { firing = false; keys.clear(); hud.showStart(); }
});
hud.onPlay(() => {
  if (shotMode) return;
  audio.unlock();
  S.started = true;
  hud.hideStart();
  canvas.requestPointerLock();
});
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (shotMode) return;
  if (S.phase === 'buy' && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) tryBuy(Number(e.code.slice(-1)) - 1);
  else if (S.phase === 'live') {
    if (e.code === 'Digit1') { loadout.equip('kestrel'); syncAmmoHud(); }
    if (e.code === 'Digit2') { const prim = BUY_ORDER.find((id) => loadout.state.owned[id]); if (prim) { loadout.equip(prim); syncAmmoHud(); } }
    if (e.code === 'KeyR' && loadout.reload()) audio.reload();
    if (e.code === 'KeyG') throwGrenade();
  }
  if (e.code === 'Tab') hud.showBoard(`Round ${S.round} — ${S.winsA} : ${S.winsF}`, S.overInfo || 'Harbour Watch attack the plant sites.', boardRows());
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Tab') hud.hideBoard(); });
window.addEventListener('blur', () => { keys.clear(); firing = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && player.state.alive) player.look(e.movementX, e.movementY);
});
window.addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement === canvas) { firing = true; if (!loadout.def().auto && loadout.ready() && player.state.alive && S.phase === 'live') playerShoot(); } });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- deterministic screenshot staging ---------------------------------------------------
function stageShot(mode) {
  S.started = true;
  hud.hideStart();
  const setBot = (bot, x, z, yaw) => { bot.pos.set(x, 0, z); bot.yaw = yaw; bot.group.rotation.y = yaw; };
  if (mode === 'start') {
    S.phase = 'buy'; S.phaseLeft = BUY_TIME; S.money = 2450;
    player.state.pos.set(-25, 0, 6); player.state.yaw = -Math.PI / 2 + 0.25; player.state.pitch = -0.02;
    setBot(bots.allies()[0], -25.5, 10.5, -Math.PI / 2);
    setBot(bots.allies()[1], -23.5, 2.5, -Math.PI / 2);
    loadout.buy('tern'); S.money = 2450;
    hud.setMoney(S.money); syncAmmoHud(); hud.setHp(100);
    hud.showBuy(buyItems(), S.money);
    hud.banner('Round 1 — buy phase', 'Harbour Watch attack. Plant on Site A (north) or Site B (south).', 60000);
    hud.setClock(BUY_TIME, 'buy', 1, 0, 0);
  } else if (mode === 'play') {
    S.phase = 'live'; S.phaseLeft = 47; S.round = 4; S.winsA = 2; S.winsF = 1; S.money = 2350;
    loadout.buy('tern');
    player.state.pos.set(-3, 0, 1); player.state.hp = 72;
    const foe = bots.foes()[0];
    setBot(foe, 7, -3.5, Math.PI * 0.78);
    setBot(bots.foes()[1], 15, 5, Math.PI * 0.9);
    setBot(bots.foes()[2], 20, -12, Math.PI);
    setBot(bots.allies()[0], -8, -5, -Math.PI / 2);
    setBot(bots.allies()[1], -10, 8, -Math.PI / 2);
    // Aim squarely at the lead foe and fire a staged burst.
    const dx = foe.pos.x - player.state.pos.x, dz = foe.pos.z - player.state.pos.z;
    player.state.yaw = Math.atan2(-dx, -dz); player.state.pitch = -0.03;
    syncCamera();
    loadout.state.mag = 19;
    playerShoot(); playerShoot();
    loadout.state.flashLeft = 0.5;
    view.flash.visible = true; view.light.intensity = 14;
    hud.setMoney(S.money); hud.setHp(72); syncAmmoHud();
    hud.feed({ killer: "Sari 'Lantern'", victim: "Danu 'Lowtide'", weapon: 'Carbine Tern-4', headshot: true });
    hud.banner('', '', 1);
    hud.setClock(47, 'live', 4, 2, 1);
  } else {
    S.phase = 'over'; S.round = 6; S.winsA = 4; S.winsF = 2; S.money = 3900;
    stat('You').k = 7; stat('You').d = 2;
    bots.allies().forEach((b, i) => { stat(b.name).k = 4 - i; stat(b.name).d = 3; });
    bots.foes().forEach((b, i) => { stat(b.name).k = 3 + i; stat(b.name).d = 5; });
    bots.damage(bots.foes()[0], 200); bots.damage(bots.foes()[2], 200);
    setBot(bots.foes()[0], 18, 12, 0); setBot(bots.foes()[2], -16, -9, 0);
    camOverride = { pos: new THREE.Vector3(-6, 15, 21), look: new THREE.Vector3(4, 0, -4) };
    hud.showBoard('Round to the Harbour Watch', 'The charge detonated on Site B. Score 4 — 2.', boardRows());
    hud.setClock(0, 'over', 6, 4, 2);
    hud.setMoney(S.money); syncAmmoHud();
  }
  syncCamera();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
  frozen = true;
}

// ---- boot ---------------------------------------------------------------------------------
hud.setHp(100); hud.setMoney(S.money); syncAmmoHud();
hud.setClock(BUY_TIME, 'buy', 1, 0, 0);
if (shotMode) stageShot(shotMode);
else { startRound(); hud.showStart(); requestAnimationFrame(frame); }
