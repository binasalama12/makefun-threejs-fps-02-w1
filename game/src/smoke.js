// Harbour Smoke: a thrown canister that blooms into a vision-blocking cloud.
// The cloud is a cluster of soft puffs that swells over the first second,
// holds for several seconds, then thins out. Bot line-of-sight checks ask
// isBlocked() — a segment-versus-sphere test against each live cloud — so a
// smoked lane genuinely breaks bot vision; bullets still pass, as they should.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SMOKE_RADIUS = 3.4;
export const SMOKE_LIFE = 8;
const BLOOM_TIME = 0.9;
const FADE_TIME = 1.6;
const CENTER_Y = 1.1;

// Fixed puff layout (offset x/y/z + scale) so every cloud has the same ragged
// silhouette without needing a random source.
const OFFS = [
  [0, 0.9, 0, 1.5], [1.3, 0.7, 0.4, 1.15], [-1.2, 0.8, -0.5, 1.2],
  [0.5, 0.6, 1.25, 1.1], [-0.6, 0.65, -1.2, 1.05], [1.8, 0.55, -1.1, 0.9],
  [-1.9, 0.5, 1.0, 0.95], [0, 1.5, 0.2, 1.0],
];

// Scratch vectors for the LOS test — isBlocked runs inside bot perception,
// so it must not allocate.
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();

export function createSmoke(scene) {
  const clouds = [];
  const canisters = [];
  const puffGeo = new THREE.SphereGeometry(1, 12, 10);
  const canGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const canMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.45, metalness: 0.35 });

  function bloom(x, z) {
    // One material per cloud so its fade does not drag sibling clouds with it.
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#cfe0da'), roughness: 1, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const puffs = [];
    for (const [ox, oy, oz, s] of OFFS) {
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.set(ox, oy, oz);
      m.scale.setScalar(0.05);
      group.add(m);
      puffs.push({ mesh: m, s });
    }
    scene.add(group);
    clouds.push({ group, puffs, mat, cx: x, cz: z, age: 0 });
  }

  function growOf(cloud) {
    const g = Math.min(1, cloud.age / BLOOM_TIME);
    const fade = cloud.age > SMOKE_LIFE - FADE_TIME ? Math.max(0, (SMOKE_LIFE - cloud.age) / FADE_TIME) : 1;
    return g * fade;
  }

  return {
    // Throw a canister from the camera along its facing; it arcs, bounces
    // once on the apron and blooms where it settles (or when its fuse ends).
    throwFrom(origin, dir) {
      const mesh = new THREE.Mesh(canGeo, canMat);
      mesh.position.copy(origin);
      scene.add(mesh);
      const vel = dir.clone().multiplyScalar(12.5);
      vel.y += 3.2;
      canisters.push({ mesh, vel, fuse: 0.85 });
    },
    // Stage a cloud directly (screenshot staging).
    deploy(pos) { bloom(pos.x, pos.z); },
    isBlocked(a, b) {
      _ab.subVectors(b, a);
      const lenSq = _ab.lengthSq();
      for (const c of clouds) {
        const grow = growOf(c);
        if (grow < 0.35) continue;
        const r = SMOKE_RADIUS * grow;
        _ap.set(c.cx - a.x, CENTER_Y - a.y, c.cz - a.z);
        const t = lenSq > 0 ? Math.max(0, Math.min(1, _ap.dot(_ab) / lenSq)) : 0;
        const dx = a.x + _ab.x * t - c.cx;
        const dy = a.y + _ab.y * t - CENTER_Y;
        const dz = a.z + _ab.z * t - c.cz;
        if (dx * dx + dy * dy + dz * dz < r * r) return true;
      }
      return false;
    },
    update(dt) {
      for (let i = canisters.length - 1; i >= 0; i--) {
        const c = canisters[i];
        c.vel.y -= 18 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        if (c.mesh.position.y < 0.13) {
          c.mesh.position.y = 0.13;
          c.vel.y *= -0.3; c.vel.x *= 0.6; c.vel.z *= 0.6;
        }
        c.fuse -= dt;
        if (c.fuse <= 0) {
          bloom(c.mesh.position.x, c.mesh.position.z);
          scene.remove(c.mesh);
          canisters.splice(i, 1);
        }
      }
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i];
        c.age += dt;
        if (c.age >= SMOKE_LIFE) {
          scene.remove(c.group);
          c.mat.dispose();
          clouds.splice(i, 1);
          continue;
        }
        const grow = growOf(c);
        c.mat.opacity = 0.52 * Math.min(1, c.age / BLOOM_TIME) * (c.age > SMOKE_LIFE - FADE_TIME ? Math.max(0, (SMOKE_LIFE - c.age) / FADE_TIME) : 1);
        for (const p of c.puffs) p.mesh.scale.setScalar(Math.max(0.05, p.s * 1.55 * grow));
      }
    },
    clear() {
      for (const c of clouds) { scene.remove(c.group); c.mat.dispose(); }
      clouds.length = 0;
      for (const c of canisters) scene.remove(c.mesh);
      canisters.length = 0;
    },
    get active() { return clouds.length; },
  };
}
