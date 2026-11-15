// Yard bots: simple harbour hands with waypoint patrol, line-of-sight checks and
// burst fire. Attackers push a lane toward a plant site, defenders hold angles
// near the stacks and rush the charge once it is planted.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { slideMove, WAYPOINTS } from './world.js';

const ALLY_NAMES = ["Bima 'Breakwater'", "Sari 'Lantern'"];
const FOE_NAMES = ["Kuro 'Silt'", "Vera 'Rustline'", "Danu 'Lowtide'"];
const BOT_SPEED = 3.1;
const SIGHT_RANGE = 46;
const EYE = 1.52;

function buildFigure(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'ally' ? PALETTE.ally : PALETTE.foe), roughness: 0.65, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.26), dark); legs.position.y = 0.36;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.3), suit); torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), dark); head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.charge) }));
  visor.position.set(0, 1.64, -0.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark); gun.position.set(0.2, 1.12, -0.3);
  group.add(legs, torso, head, visor, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group, torso, head };
}

export function createBots(scene, rng) {
  const bots = [];
  const hitMeshes = [];
  function spawn(team, name, pos) {
    const fig = buildFigure(team);
    fig.group.position.copy(pos);
    scene.add(fig.group);
    const bot = {
      team, name, group: fig.group, torso: fig.torso, head: fig.head,
      pos: fig.group.position, hp: 100, alive: true, yaw: 0,
      wp: Math.floor(rng.next() * WAYPOINTS.length),
      goal: null, mode: 'patrol', seeTimer: rng.next() * 0.2, fireTimer: 1 + rng.next(),
      burst: 0, react: 0, strafeDir: rng.sign(), strafeTimer: 0, fallT: 0,
      target: null, lastSeen: null, defuseChannel: 0,
      dmgMin: team === 'ally' ? 9 : 11, dmgMax: team === 'ally' ? 18 : 23,
    };
    fig.torso.userData.bot = bot; fig.torso.userData.part = 'torso';
    fig.head.userData.bot = bot; fig.head.userData.part = 'head';
    hitMeshes.push(fig.torso, fig.head);
    bots.push(bot);
    return bot;
  }

  const losDir = new THREE.Vector3();
  const losOrigin = new THREE.Vector3();
  function hasSight(bot, targetPos, ctx) {
    losOrigin.set(bot.pos.x, EYE, bot.pos.z);
    losDir.copy(targetPos).setY(1.25).sub(losOrigin);
    const dist = losDir.length();
    if (dist > SIGHT_RANGE) return false;
    losDir.normalize();
    ctx.raycaster.set(losOrigin, losDir);
    ctx.raycaster.far = dist - 0.7;
    const hit = ctx.raycaster.intersectObjects(ctx.worldShootables, false)[0];
    return !hit;
  }

  function moveToward(bot, dest, dt, speedScale) {
    const dx = dest.x - bot.pos.x, dz = dest.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const sp = BOT_SPEED * (speedScale || 1);
    slideMove(ctxColliders, bot.pos, (dx / d) * sp * dt, (dz / d) * sp * dt, 0.36);
    bot.yaw = Math.atan2(-(dx / d), -(dz / d));
    return d < 1.1;
  }
  let ctxColliders = [];

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fallT = Math.min(1, bot.fallT + dt * 2.4);
      bot.group.rotation.x = -bot.fallT * (Math.PI / 2) * 0.92;
      bot.group.position.y = -bot.fallT * 0.1;
      return;
    }
    bot.group.rotation.y = bot.yaw;
    // Perception runs on a staggered timer so the whole yard is not raycast every frame.
    bot.seeTimer -= dt;
    if (bot.seeTimer <= 0) {
      bot.seeTimer = 0.18;
      let best = null, bestD = Infinity;
      for (const t of ctx.targetsOf(bot)) {
        if (!t.alive) continue;
        const d = bot.pos.distanceTo(t.pos);
        if (d < bestD && hasSight(bot, t.pos, ctx)) { best = t; bestD = d; }
      }
      if (best) { bot.target = best; bot.lastSeen = best.pos.clone(); bot.react += 0.18; }
      else { bot.target = null; bot.react = Math.max(0, bot.react - 0.1); }
    }
    if (bot.target && bot.react > 0.22) {
      bot.mode = 'engage';
      const t = bot.target;
      bot.yaw = Math.atan2(-(t.pos.x - bot.pos.x), -(t.pos.z - bot.pos.z));
      // Strafe in short steps while firing; stop-and-shoot bots are deadlier, so
      // their bursts pause while they reposition.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) { bot.strafeTimer = 0.8 + ctx.rng.next() * 0.9; bot.strafeDir = ctx.rng.sign(); bot.burst = 0; }
      const dist = bot.pos.distanceTo(t.pos);
      if (dist > 16) moveToward(bot, t.pos, dt, 0.9);
      else if (bot.burst === 0) {
        const px = Math.cos(bot.yaw) * bot.strafeDir, pz = -Math.sin(bot.yaw) * bot.strafeDir;
        slideMove(ctx.colliders, bot.pos, px * 1.6 * dt, pz * 1.6 * dt, 0.36);
      }
      bot.fireTimer -= dt;
      if (bot.fireTimer <= 0) {
        if (bot.burst < 3) {
          bot.burst += 1; bot.fireTimer = 0.14;
          const movePenalty = t.speed > 2 ? 0.16 : 0;
          // Tuned after the first full playtest build: bots were shredding the
          // player across the long dock sightline, so range falloff is steeper.
          const hitChance = Math.max(0.07, 0.43 - dist * 0.0075 - movePenalty);
          const hit = ctx.rng.next() < hitChance;
          const head = hit && ctx.rng.next() < 0.14;
          const dmg = hit ? (ctx.rng.range(bot.dmgMin, bot.dmgMax) * (head ? 2.4 : 1)) : 0;
          ctx.onBotShot(bot, t, hit, Math.round(dmg), head);
        } else { bot.burst = 0; bot.fireTimer = 0.75 + ctx.rng.next() * 0.7; }
      }
      return;
    }
    bot.mode = bot.goal ? 'push' : 'patrol';
    const dest = bot.goal || WAYPOINTS[bot.wp];
    if (moveToward(bot, dest, dt, 1)) {
      if (bot.goal && bot.onArrive) bot.onArrive(bot);
      if (!bot.goal) bot.wp = (bot.wp + 1 + Math.floor(ctx.rng.next() * 3)) % WAYPOINTS.length;
    }
  }

  return {
    bots, hitMeshes,
    allies: () => bots.filter((b) => b.team === 'ally'),
    foes: () => bots.filter((b) => b.team === 'foe'),
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    spawnAll(allySpawns, foeSpawns) {
      for (let i = 0; i < ALLY_NAMES.length; i++) spawn('ally', ALLY_NAMES[i], allySpawns[i % allySpawns.length]);
      for (let i = 0; i < FOE_NAMES.length; i++) spawn('foe', FOE_NAMES[i], foeSpawns[i % foeSpawns.length]);
    },
    resetAll(allySpawns, foeSpawns) {
      let ai = 0, fi = 0;
      for (const bot of bots) {
        const home = bot.team === 'ally' ? allySpawns[ai++ % allySpawns.length] : foeSpawns[fi++ % foeSpawns.length];
        bot.pos.copy(home); bot.hp = 100; bot.alive = true; bot.fallT = 0;
        bot.group.rotation.set(0, 0, 0); bot.group.position.y = 0;
        bot.goal = null; bot.target = null; bot.onArrive = null; bot.defuseChannel = 0;
      }
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp <= 0) { bot.alive = false; bot.fallT = 0; return true; }
      return false;
    },
    step(dt, ctx) {
      ctxColliders = ctx.colliders;
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
  };
}
