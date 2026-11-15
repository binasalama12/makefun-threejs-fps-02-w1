// HARBORLINE BREACH map: a container yard at dusk with three lanes.
// West-to-east the yard runs dock lane (cranes over the water side), the dense
// container middle, and the warehouse lane. Sites A and B are marked container
// stacks at opposite ends so every round forces a lane choice.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'Site A — North Stacks', pos: new THREE.Vector3(-19, 0, -11), radius: 4.2 },
  B: { name: 'Site B — South Stacks', pos: new THREE.Vector3(20, 0, 11), radius: 4.2 },
};
export const ATTACK_SPAWN = new THREE.Vector3(-26, 0, 14);
export const DEFEND_SPAWNS = [new THREE.Vector3(24, 0, -14), new THREE.Vector3(14, 0, -16), new THREE.Vector3(26, 0, 4), new THREE.Vector3(10, 0, 14)];
export const ALLY_SPAWNS = [new THREE.Vector3(-26, 0, 10), new THREE.Vector3(-23, 0, 17)];

// Patrol / push waypoints shared by both bot teams, grouped by lane.
export const WAYPOINTS = [
  new THREE.Vector3(-26, 0, 0), new THREE.Vector3(-16, 0, -2), new THREE.Vector3(-6, 0, 0),
  new THREE.Vector3(4, 0, -2), new THREE.Vector3(14, 0, 0), new THREE.Vector3(24, 0, -2),
  new THREE.Vector3(-19, 0, -11), new THREE.Vector3(-8, 0, -13), new THREE.Vector3(4, 0, -13),
  new THREE.Vector3(16, 0, -12), new THREE.Vector3(24, 0, -14),
  new THREE.Vector3(-14, 0, 9), new THREE.Vector3(-2, 0, 11), new THREE.Vector3(10, 0, 9),
  new THREE.Vector3(20, 0, 11), new THREE.Vector3(26, 0, 14),
  new THREE.Vector3(-26, 0, 14), new THREE.Vector3(0, 0, 4), new THREE.Vector3(0, 0, -7),
];

function mat(color, rough, metal) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough ?? 0.85, metalness: metal ?? 0.08 });
}

export function createWorld(scene) {
  const colliders = [];
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);

  const concrete = mat(PALETTE.concrete, 0.95);
  const steel = mat(PALETTE.steel, 0.6, 0.35);
  const teal = mat(PALETTE.teal, 0.7, 0.2);
  const deepTeal = mat(PALETTE.deepTeal, 0.75, 0.2);
  const rust = mat(PALETTE.rust, 0.72, 0.25);
  const rustDark = mat(PALETTE.rustDark, 0.8, 0.2);
  const wood = mat(PALETTE.crateWood, 0.9);
  const containerMats = [teal, rust, deepTeal, rustDark, steel, mat('#c96a1e', 0.7, 0.2)];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }
  function container(x, z, ry, level, mi) {
    const m = containerMats[mi % containerMats.length];
    const mesh = box(6.1, 2.6, 2.45, x, 1.3 + level * 2.6, z, m);
    mesh.rotation.y = ry;
    // Rebuild the collider after rotation for the two rotated stacks only loosely:
    // axis-aligned approximation is fine because rotations here are 0 or 90 degrees.
    return mesh;
  }

  // Ground: cracked concrete apron plus a darker water strip beyond the dock edge.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(68, 0.4, 52), concrete);
  ground.position.set(0, -0.2, 0); ground.receiveShadow = true;
  group.add(ground); shootables.push(ground);
  colliders.push(new THREE.Box3().setFromObject(ground));
  const water = new THREE.Mesh(new THREE.BoxGeometry(68, 0.2, 8), mat('#173f4a', 0.35, 0.4));
  water.position.set(0, -0.32, -29); group.add(water);

  // Perimeter: harbour fence walls.
  box(68, 5, 0.5, 0, 2.5, -25.5, steel);
  box(68, 5, 0.5, 0, 2.5, 25.5, steel);
  box(0.5, 5, 52, -33.5, 2.5, 0, steel);
  box(0.5, 5, 52, 33.5, 2.5, 0, steel);

  // Dock lane (north, z about -14): crane legs and low crates under the rails.
  for (const cx of [-20, 0, 20]) {
    box(1.1, 9, 1.1, cx - 4, 4.5, -19, rustDark);
    box(1.1, 9, 1.1, cx + 4, 4.5, -19, rustDark);
    box(10.5, 1.2, 1.4, cx, 9.2, -19, rust);
    box(2.2, 0.8, 0.6, cx, 8.2, -19, steel, false);
  }
  box(1.8, 1.1, 1.8, -10, 0.55, -15, wood);
  box(1.8, 1.1, 1.8, 8, 0.55, -16, wood);
  box(2.6, 1.1, 1.4, 26, 0.55, -13, wood);

  // Container middle: stacked boxes leave three cross cuts and long sightlines.
  container(-14, -5, 0, 0, 0); container(-14, -5, 0, 1, 1);
  container(-14, 4, 0, 0, 2);
  container(-5, -6, 0, 0, 3); container(-5, 3, 0, 0, 4); container(-5, 3, 0, 1, 0);
  container(4, -5, 0, 0, 1); container(4, 5, 0, 0, 5);
  container(13, -6, 0, 0, 2); container(13, -6, 0, 1, 3); container(13, 4, 0, 0, 0);
  container(22, -4, 0, 0, 4);
  // Site stacks: the A stack west-north, the B stack east-south, both two high.
  container(-19, -11, 0, 0, 1); container(-19, -15.5, 0, 0, 3);
  container(20, 15.5, 0, 0, 0); container(20, 11, 0, 1, 5);
  // A rotated pair framing the central cut.
  const r1 = box(6.1, 2.6, 2.45, 0, 1.3, -12, teal); r1.rotation.y = Math.PI / 2;
  colliders.pop(); colliders.push(new THREE.Box3().setFromObject(r1));
  const r2 = box(6.1, 2.6, 2.45, -1, 1.3, 8, rust); r2.rotation.y = Math.PI / 2;
  colliders.pop(); colliders.push(new THREE.Box3().setFromObject(r2));

  // Warehouse lane (south): a long shed with a doorway gap, pallets and a forklift block.
  box(26, 4.4, 0.5, 2, 2.2, 21, deepTeal);
  box(0.5, 4.4, 10, -11, 2.2, 16.5, deepTeal);
  box(0.5, 4.4, 10, 15, 2.2, 16.5, deepTeal);
  box(26, 0.5, 10.5, 2, 4.6, 16.5, rustDark);
  box(2.2, 1.15, 2.2, -6, 0.58, 17, wood);
  box(2.2, 1.15, 2.2, 6, 0.58, 18, wood);
  box(3.2, 1.5, 1.6, 24, 0.75, 18, steel);
  box(1.6, 2.2, 1.6, -28, 1.1, -8, steel);
  box(1.6, 1.1, 1.6, 28, 0.55, -6, wood);

  // Site pads: glowing rings the charge can be planted on.
  const padMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.dusk), transparent: true, opacity: 0.85 });
  const padMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.charge), transparent: true, opacity: 0.85 });
  for (const [site, m] of [[SITES.A, padMatA], [SITES.B, padMatB]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.35, site.radius, 40), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.pos.x, 0.03, site.pos.z);
    group.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(site.radius - 0.35, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.dusk), transparent: true, opacity: 0.13 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.pos.x, 0.02, site.pos.z);
    group.add(disc);
  }

  // Charge prop (hidden until planted).
  const chargeGroup = new THREE.Group();
  const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.4), mat('#333a3e', 0.5, 0.5));
  chargeBody.position.y = 0.19;
  const chargeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.charge) }));
  chargeLamp.position.y = 0.46;
  chargeGroup.add(chargeBody, chargeLamp);
  chargeGroup.visible = false;
  group.add(chargeGroup);

  // Sky, sun and harbour haze.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 34, 95);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffd9a8'), new THREE.Color('#1d3038'), 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.dusk), 2.4);
  sun.position.set(-26, 20, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 90; sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.5);
  fill.position.set(18, 12, 20);
  scene.add(fill);
  // Yard floodlights so shadowed lanes still read.
  for (const [lx, lz] of [[-16, 0], [10, -10], [18, 16]]) {
    const lamp = new THREE.PointLight(new THREE.Color('#ffb066'), 55, 26, 1.6);
    lamp.position.set(lx, 6.4, lz);
    scene.add(lamp);
    box(0.22, 6.4, 0.22, lx, 3.2, lz, steel, false);
  }

  return { colliders, shootables, group, chargeGroup, chargeLamp };
}

// Circle-versus-colliders test on the ground plane; y is ignored because every
// combatant walks the same flat apron.
export function hitsCollider(colliders, x, z, radius) {
  for (const b of colliders) {
    if (b.max.y < 0.5) continue;
    if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z) return b;
  }
  return null;
}
export function slideMove(colliders, pos, dx, dz, radius) {
  if (!hitsCollider(colliders, pos.x + dx, pos.z, radius)) pos.x += dx;
  if (!hitsCollider(colliders, pos.x, pos.z + dz, radius)) pos.z += dz;
  pos.x = Math.max(-32.6, Math.min(32.6, pos.x));
  pos.z = Math.max(-24.6, Math.min(24.6, pos.z));
}
