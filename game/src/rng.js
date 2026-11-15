// Seeded random helpers. The screenshot modes and the bot jitter both draw from one
// mulberry-style generator so a given seed always stages the same harbour scene.
export function makeRng(seed) {
  let state = (seed * 2654435761) >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    pick(list) { return list[Math.floor(next() * list.length) % list.length]; },
    sign() { return next() < 0.5 ? -1 : 1; },
  };
}
