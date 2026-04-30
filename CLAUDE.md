# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Project Overview

**Xianxia Air Combat** (仙侠空战) — A 3D aerial combat game with Chinese fantasy (xianxia) theme. The player rides a flying sword, fights waves of enemies across procedurally-generated floating arenas.

## Commands

```bash
npm run dev        # Start Vite dev server (HMR, default port 5173)
npm run build      # TypeScript check + Vite production build
npm run preview    # Preview production build locally
npm run typecheck  # TypeScript type-check only (no emit)
```

No test framework is configured. No linter is configured.

## Architecture

### Entry Points

- `src/entry.ts` — Browser entry (loaded by `index.html`). Creates `Game`, wires start button and pointer-lock overlay.
- `src/main.ts` — Programmatic API entry (`startXianxia`/`stopXianxia`) for embedding.

### Core Game Loop

`Game.ts` is the orchestrator. It owns all subsystems and runs a single `update(dt)` callback registered on `Engine`:

```
Engine (RAF loop) → Game.update(dt)
  ├── FlightController.update(dt)     # Player physics
  ├── Arena.resolveSphereVsBuildings  # Collision
  ├── CameraSystem.update(dt)         # Follow camera
  ├── PlayerModel.update()            # Third-person mesh
  ├── WeaponSystem.update(dt)         # Beams, missiles
  ├── Enemy[].update(dt)              # AI + attacks
  ├── Boss.update(dt)                 # Boss AI
  ├── Pickup collision checks
  ├── Missile hit detection
  ├── Wave progression logic
  └── HUD updates
```

### Module Organization

| Directory | Purpose |
|-----------|---------|
| `src/shared/` | Engine (Three.js renderer/scene/loop), Input (keyboard/mouse/touch), Sfx (Web Audio procedural sounds), collision math |
| `src/player/` | FlightController (6DOF quaternion flight physics), PlayerModel (third-person mesh + trail), WeaponSystem (beam/missile/sword) |
| `src/enemy/` | Enemy (AI state machine: patrol/chase/attack/flee), Boss (multi-phase), enemy-types config |
| `src/world/` | Arena (procedural buildings/bridges/islands/skybox), Pickup (collectibles) |
| `src/core/` | CameraSystem (third-person spring-damper + first-person, V to toggle) |
| `src/ui/` | Hud (DOM-based flight instruments, radar canvas, overlays) |
| `src/config.ts` | All tunable game parameters in one `CONFIG` object |

### Key Design Patterns

- **No external assets**: All geometry is procedural (Three.js primitives), all sound is synthesized (Web Audio oscillators/noise).
- **Quaternion-based flight**: `FlightController` uses quaternion rotation (no Euler gimbal lock). Mouse drives yaw/pitch directly; Q/E roll uses angular velocity with drag.
- **CONFIG-driven tuning**: All physics, weapon stats, enemy stats, progression, and rendering parameters live in `src/config.ts`. Change values there to rebalance.
- **Pointer-lock control**: Game requires pointer lock for mouse look. Losing pointer lock shows the overlay/pause screen.
- **Wave/Level progression**: Each level has N waves of enemies. Boss appears on final wave of boss levels (3, 6, 9, 12). Level completion triggers next arena.

### Controls (current bindings)

| Key | Action |
|-----|--------|
| W/A/S/D | Thrust (local frame) |
| Space | Ascend |
| Ctrl | Descend |
| Shift | Boost (sprint) |
| Q/E | Roll |
| Mouse | Yaw/Pitch |
| Left Click | Fire spirit beam |
| V | Toggle camera (first/third person) |
| F | Sword dash |

### State Machine

Game states: `menu → briefing → playing → (dead | level_complete | game_over)`

Enemy states: `patrol → chase → attack → flee → dead`

Boss phases: Phase 1 → Phase 2 (60% HP) → Phase 3 (30% HP, shield)
