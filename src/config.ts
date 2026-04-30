/**
 * Global game configuration for XianxiaAirCombat.
 * All tunable parameters in one place. Hot-reloads via Vite HMR.
 */
export const CONFIG = {
  // ─── Flight Physics ───
  flight: {
    maxThrust: 40,
    maxSpeed: 50,
    drag: 0.95,
    angularThrust: 2.5,
    maxAngularSpeed: 2.0,
    angularDrag: 0.88,
    boostMultiplier: 2.0,
    boostDuration: 3.0,
    boostCooldown: 5.0,
    playerRadius: 0.8,
    minHeight: -20,
    maxHeight: 150,
    heightDragStart: 130,
    boundaryRadius: 250,
    boundaryDragWidth: 30,
  },

  // ─── Camera ───
  camera: {
    thirdPersonDistance: 10,
    thirdPersonHeight: 4,
    springStiffness: 15.0,
    springDamping: 12.0,
    transitionDuration: 0.4,
    fov: 78,
    near: 0.1,
    far: 800,
  },

  // ─── Spirit (Mana) ───
  spirit: {
    maxSpirit: 100,
    regenRate: 5,
    beamCost: 3,
    dashCost: 15,
  },

  // ─── Weapons ───
  weapons: {
    beam: {
      name: '灵力射线',
      damage: 25,
      fireRate: 0.12,
      maxRange: 150,
      spiritCost: 3,
      color: 0x88ccff,
    },
    missile: {
      name: '符箓追踪弹',
      damage: 45,
      aoeRadius: 3,
      fireRate: 0.5,
      maxInFlight: 4,
      maxRange: 200,
      trackDuration: 5,
      lockAngle: Math.PI / 36,
      lockTime: 1.0,
      initialAmmo: 8,
      color: 0xffcc00,
    },
    sword: {
      name: '飞剑近战',
      damage: 80,
      dashDistance: 15,
      dashDuration: 0.2,
      cooldown: 2.0,
      invincibleDuration: 0.3,
      spiritCost: 15,
      color: 0x00ffcc,
    },
  },

  // ─── Player ───
  player: {
    maxHealth: 100,
    startHeight: 80,
  },

  // ─── Enemies ───
  enemies: {
    types: {
      crow: {
        name: '灵鸦',
        hp: 30,
        speed: 25,
        attackDamage: 10,
        attackType: 'fireball' as const,
        color: 0x222222,
        scale: 0.5,
        groupSize: { min: 3, max: 5 },
      },
      serpent: {
        name: '岩蟒',
        hp: 120,
        speed: 15,
        attackDamage: 25,
        attackType: 'breath' as const,
        breathAngle: Math.PI / 6,
        color: 0x886644,
        scale: 1.5,
      },
      dragon: {
        name: '蛟龙',
        hp: 300,
        speed: 40,
        attackDamage: 35,
        chargeDamage: 50,
        attackType: 'dragonbreath' as const,
        color: 0x2244aa,
        scale: 2.5,
      },
    },
    scaling: {
      hpPerLevel: 0.15,
      damagePerLevel: 0.10,
      speedPerLevel: 0.03,
    },
    engageDistance: 80,
    fleeHpPercent: 0.2,
    avoidDistance: 15,
  },

  // ─── Boss ───
  boss: {
    baseHp: 800,
    phase1Threshold: 0.6,
    phase2Threshold: 0.3,
    phase2SpeedBoost: 1.5,
    phase3SpeedBoost: 1.3,
    summonCount: 2,
    shieldHp: 200,
    color: 0xcc00ff,
  },

  // ─── Arena ───
  arena: {
    levelConfigs: [
      { buildings: 8, bridges: 3, islands: 5, spread: 200, skyTint: '#0a0a3e' },
      { buildings: 12, bridges: 5, islands: 8, spread: 300, skyTint: '#1a0a2e' },
      { buildings: 15, bridges: 6, islands: 10, spread: 400, skyTint: '#2a1a1e' },
    ] as Array<{ buildings: number; bridges: number; islands: number; spread: number; skyTint: string }>,
    skyTintPresets: ['#0a0a3e', '#1a0a2e', '#2a1a1e', '#0a1a2e'],
    buildingMinGap: 20,
    heightRange: [30, 120] as [number, number],
    islandRadius: [1, 3] as [number, number],
    buildingsPerLevel: 2,
    spreadPerLevel: 30,
    bodyColor: 0xf0f0f0,
    accentColor: 0xdaa520,
    fogDensity: 0.008,
    cloudHeight: 0,
  },

  // ─── Pickups ───
  pickups: {
    spiritOrb: { color: 0x4488ff, value: 30 },
    healthPill: { color: 0x44ff88, value: 25 },
    missileBox: { color: 0xffcc00, value: 2 },
  },

  // ─── Progression ───
  progression: {
    totalLevels: 12,
    bossLevels: [3, 6, 9, 12],
    wavesPerLevel: 3,
    waveRestTime: 5,
    scaling: {
      hpPerLevel: 1.15,
      damagePerLevel: 1.10,
      enemyCountBase: 3,
      enemyCountPerLevel: 0.5,
      speedPerLevel: 1.03,
    },
    arenaScaling: {
      buildingsPerLevel: 2,
      spreadPerLevel: 30,
    },
    unlocks: [
      { level: 3, type: 'weapon', id: 'missile' },
      { level: 6, type: 'upgrade', id: 'missile_dual_lock' },
      { level: 9, type: 'upgrade', id: 'beam_pierce' },
      { level: 12, type: 'upgrade', id: 'sword_enhanced' },
    ] as Array<{ level: number; type: string; id: string }>,
  },

  // ─── Rendering ───
  render: {
    fov: 78,
    near: 0.1,
    far: 800,
    fogColor: 0x0a0a2e,
    fogDensity: 0.003,
    ambientColor: 0x8888cc,
    ambientIntensity: 0.6,
    moonColor: 0xffffff,
    moonIntensity: 1.2,
  },

  // ─── HUD ───
  hud: {
    radarRadius: 200,
    radarSize: 150,
  },
} as const;
