// First-person body: acceleration and friction on the flat harbour apron,
// crouching for tighter spread, a small hop, and axis-separated sliding so
// container corners stop the player instead of swallowing them.
import * as THREE from 'three';
import { slideMove } from './world.js';

const RADIUS = 0.36;
const WALK = 5.4;
const CROUCH_WALK = 2.5;
const ACCEL = 11;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;

export function createPlayer(colliders, spawn) {
  const state = {
    pos: spawn.clone(),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2, // face east into the yard from the west spawn
    pitch: 0,
    eye: EYE_STAND,
    crouching: false,
    hp: 100,
    alive: true,
    airTime: 0,
  };
  const wish = new THREE.Vector3();
  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * 0.0021));
  }
  function recoil(dp, dy) {
    state.pitch = Math.min(1.45, state.pitch + dp);
    state.yaw += dy;
  }
  function step(dt, keys, frozen) {
    state.crouching = !frozen && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    const eyeGoal = state.crouching ? EYE_CROUCH : EYE_STAND;
    state.eye += (eyeGoal - state.eye) * Math.min(1, dt * 11);
    wish.set(0, 0, 0);
    if (!frozen && state.alive) {
      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      if (f || s) {
        const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
        wish.set(-sin * f + cos * s, 0, -cos * f - sin * s).normalize();
      }
    }
    const top = state.crouching ? CROUCH_WALK : WALK;
    const blend = Math.min(1, ACCEL * dt);
    state.vel.x += (wish.x * top - state.vel.x) * blend;
    state.vel.z += (wish.z * top - state.vel.z) * blend;
    slideMove(colliders, state.pos, state.vel.x * dt, state.vel.z * dt, RADIUS);
    state.airTime = 0; // flat apron: no jumping in this build, footing is always solid
  }
  return {
    state, look, recoil, step,
    speed() { return Math.hypot(state.vel.x, state.vel.z); },
    reset(spawnPos) {
      state.pos.copy(spawnPos); state.vel.set(0, 0, 0);
      state.yaw = -Math.PI / 2; state.pitch = 0; state.hp = 100; state.alive = true;
    },
  };
}
