# HARBORLINE BREACH

A round-based tactical FPS in a container port at dusk, built with three.js.
You lead the **Harbour Watch**, an attacking crew of three (you plus two bots),
against the **Rust Syndicate**, three defenders who hold the yard.

## How to play

Cross the yard by one of three lanes — the crane-lined **dock lane**, the dense
**container middle**, or the **warehouse lane** — then plant the charge on the
glowing pad at **Site A (North Stacks)** or **Site B (South Stacks)** and keep
the defenders away until it detonates. You also win a round by eliminating the
whole Syndicate. They win by eliminating your crew before the plant, by
defusing a planted charge, or by running out the round clock. First crew to
six rounds takes the harbour.

Between rounds there is a short buy phase: earn money for kills, plants and
round wins, and spend it at the quartermaster. Gear is kept while you survive
and lost when you fall.

Serve `game/` with any static file server and open `index.html` in a desktop
browser — no build step, no network calls.

## Controls

- **WASD** move, **mouse** look (pointer lock), **left click** fire
- **R** reload, **Ctrl** or **C** crouch
- **1–5** buy during the buy phase; in a live round **1** sidearm, **2** primary
- **E** (hold) plant the charge on a site pad
- **G** throw a Barnacle grenade, **Tab** (hold) scoreboard

## Features

- Five original firearms — P9 Kestrel sidearm, SMG Sprayling, Carbine Tern-4,
  Scattergun Brine and the bolt-action Longshot Gull — each with its own price,
  damage, magazine and handling, plus throwable Barnacle grenades.
- Accuracy-first gunplay: spread blooms while running or spraying and tightens
  when you stop or crouch; headshots multiply damage; tracers and hitmarkers
  confirm every connection.
- Bots that patrol waypoints across all three lanes, check line-of-sight,
  react, strafe and fire in bursts; defenders hold the sites and rush to
  defuse once the charge is planted.
- Full HUD: health, money, round, phase timer, team score, ammunition,
  grenade count, kill feed, plant/defuse progress and an end-of-round
  scoreboard.
- All sound is synthesised live with WebAudio (gunfire, hits, beeps, the
  detonation) — there are no audio files.
- Deterministic screenshot mode: open `index.html?shot=start|play|end&seed=N`
  to stage a frozen, representative scene of the menu, mid-round action or the
  final scoreboard.
