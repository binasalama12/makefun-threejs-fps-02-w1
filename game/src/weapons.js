// The harbour armoury. Five invented firearms plus a throwable charge-cracker
// grenade. Accuracy is the theme: spread collapses when the shooter stands still
// or crouches and blooms hard while running or spraying.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  kestrel: { id: 'kestrel', name: 'P9 Kestrel', slot: 'sidearm', price: 0, damage: 34, headMult: 3.2, mag: 12, reserve: 48, fireGap: 0.24, reloadTime: 1.2, auto: false, pellets: 1, spreadStill: 0.003, spreadMove: 0.02, range: 70, sound: 'light', kick: 0.012 },
  sprayling: { id: 'sprayling', name: 'SMG Sprayling', slot: 'primary', price: 1100, damage: 22, headMult: 2.6, mag: 32, reserve: 96, fireGap: 0.075, reloadTime: 1.7, auto: true, pellets: 1, spreadStill: 0.008, spreadMove: 0.035, range: 55, sound: 'light', kick: 0.007 },
  tern: { id: 'tern', name: 'Carbine Tern-4', slot: 'primary', price: 1700, damage: 36, headMult: 3.0, mag: 25, reserve: 75, fireGap: 0.105, reloadTime: 1.9, auto: true, pellets: 1, spreadStill: 0.0025, spreadMove: 0.028, range: 90, sound: 'light', kick: 0.011 },
  brine: { id: 'brine', name: 'Scattergun Brine', slot: 'primary', price: 900, damage: 11, headMult: 2.0, mag: 6, reserve: 24, fireGap: 0.85, reloadTime: 2.4, auto: false, pellets: 8, spreadStill: 0.045, spreadMove: 0.06, range: 26, sound: 'scatter', kick: 0.03 },
  gull: { id: 'gull', name: 'Longshot Gull', slot: 'primary', price: 2700, damage: 96, headMult: 2.2, mag: 5, reserve: 20, fireGap: 1.25, reloadTime: 2.6, auto: false, pellets: 1, spreadStill: 0.0008, spreadMove: 0.05, range: 140, sound: 'heavy', kick: 0.035 },
};
export const BUY_ORDER = ['sprayling', 'brine', 'tern', 'gull'];
export const GRENADE_PRICE = 300;
export const GRENADE_DAMAGE = 95;
export const GRENADE_RADIUS = 5.2;
export const SMOKE_PRICE = 200;

export function spreadFor(def, speed, crouching, airTime) {
  const moveT = Math.min(1, speed / 5.4);
  let s = def.spreadStill + (def.spreadMove - def.spreadStill) * moveT;
  if (crouching) s *= 0.55;
  if (airTime > 0.05) s += 0.03;
  return s;
}

// A chunky low-poly view model whose proportions hint at the held weapon class.
export function buildViewModel(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 0.6, metalness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.46), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), accent);
  barrel.position.set(0, 0.03, -0.4);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), dark);
  grip.position.set(0, -0.12, 0.08); grip.rotation.x = 0.3;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.09), accent);
  mag.position.set(0, -0.12, -0.08);
  group.add(body, barrel, grip, mag);
  group.position.set(0.25, -0.22, -0.45);
  camera.add(group);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.dusk), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.25, -0.19, -1.05);
  flash.rotation.z = Math.PI / 4; // diamond burst, not a square card
  flash.visible = false;
  camera.add(flash);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.dusk), 0, 6);
  light.position.set(0.25, -0.15, -0.7);
  camera.add(light);
  return { group, flash, light, barrelTip: new THREE.Vector3(0.25, -0.19, -1.0) };
}

// Loadout state for one combatant's hands: current def, mag and reserve counts,
// cooldowns and reload progress. Shared shape for the player; bots use timers only.
export function createLoadout() {
  const owned = { kestrel: true };
  let current = 'kestrel';
  const state = {
    owned,
    grenades: 0,
    smokes: 0,
    mag: WEAPONS.kestrel.mag,
    reserve: WEAPONS.kestrel.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flashLeft: 0,
    kick: 0,
  };
  function def() { return WEAPONS[current]; }
  function equip(id) {
    if (!owned[id]) return false;
    current = id;
    state.mag = WEAPONS[id].mag;
    state.reserve = WEAPONS[id].reserve;
    state.cooldown = 0.25; state.reloadLeft = 0;
    return true;
  }
  function buy(id) { owned[id] = true; return equip(id); }
  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flashLeft = Math.max(0, state.flashLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take; state.reserve -= take;
      }
    }
  }
  return {
    state, def, equip, buy,
    get current() { return current; },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    consume() { state.mag -= 1; state.cooldown = def().fireGap; state.flashLeft = 0.055; state.kick = Math.min(0.09, def().kick * 2.2); },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reloadTime; return true;
    },
    step,
    resetRound(keepGear) {
      if (!keepGear) { for (const k of Object.keys(owned)) if (k !== 'kestrel') delete owned[k]; current = 'kestrel'; state.grenades = 0; state.smokes = 0; }
      if (!owned[current]) current = 'kestrel';
      state.mag = def().mag; state.reserve = def().reserve;
      state.cooldown = 0; state.reloadLeft = 0; state.flashLeft = 0; state.kick = 0;
    },
  };
}
