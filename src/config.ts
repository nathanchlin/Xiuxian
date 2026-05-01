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

  // ─── Skills (4技能BD) ───
  skills: {
    swordIntent: {
      maxStacks: 5,
      decayTime: 10,
    },
    bladeFan: {
      name: '灵刃散射',
      spiritCost: 8,
      cooldown: 1.5,
      damage: 15,
      range: 80,
      projectileSpeed: 60,
      projectileRadius: 1,
      fanAngle: Math.PI / 24,
      bladeCount: 3,
      intentPerHit: 1,
      color: 0x44ffcc,
    },
    swordDash: {
      name: '御剑突刺',
      spiritCost: 20,
      cooldown: 3,
      damage: 60,
      dashDistance: 20,
      dashDuration: 0.2,
      invincibleDuration: 0.3,
      intentPerHit: 2,
      hitRadius: 3,
      color: 0x00ffcc,
    },
    parry: {
      name: '剑气护体',
      spiritCost: 15,
      cooldown: 4,
      parryWindow: 1.5,
      reflectDamage: 70,
      intentOnSuccess: 3,
      color: 0xffd700,
    },
    finalStrike: {
      name: '万剑归宗',
      spiritCost: 30,
      requiredIntent: 5,
      damage: 150,
      range: 200,
      chargeTime: 0.5,
      beamRadius: 3,
      beamDuration: 0.3,
      chargeFov: 72,
      color: 0xffd700,
    },
    growth: {
      killsPerLevel: 5,
      maxLevel: 10,
      damagePerLevel: 0.10,
      cooldownPerLevel: 0.05,
      minCooldown: 0.3,
    },
  },

  // ─── Player ───
  player: {
    maxHealth: 200,
    startHeight: 80,
  },

  // ─── Enemies ───
  enemies: {
    types: {
      crow: {
        name: '灵鸦',
        hp: 30,
        speed: 25,
        attackDamage: 2,
        attackType: 'fireball' as const,
        color: 0x222222,
        scale: 0.5,
        groupSize: { min: 3, max: 5 },
      },
      serpent: {
        name: '岩蟒',
        hp: 120,
        speed: 15,
        attackDamage: 4,
        attackType: 'breath' as const,
        breathAngle: Math.PI / 6,
        color: 0x886644,
        scale: 1.5,
      },
      dragon: {
        name: '蛟龙',
        hp: 300,
        speed: 40,
        attackDamage: 6,
        chargeDamage: 8,
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
    baseHp: 400,
    phase1Threshold: 0.6,
    phase2Threshold: 0.3,
    phase2SpeedBoost: 1.5,
    phase3SpeedBoost: 1.3,
    summonCount: 2,
    shieldHp: 100,
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

  // ─── Talismans (符箓副武器) ───
  talismans: {
    maxCarry: 2,
    dropExpireTime: 10,
    chestPerLevel: 3,
    dropRates: {
      crow: 0.15,
      serpent: 0.30,
      dragon: 0.50,
      boss: 1.0,
    } as Record<string, number>,
    types: {
      soulseeker: {
        name: '追魂符',
        description: '自动追踪攻击最近敌人',
        durability: 25,
        damage: 20,
        interval: 0.7,
        range: 80,
        projectileSpeed: 70,
        trackingLerp: 5,
        color: 0xffaa00,
      },
      thunderbolt: {
        name: '雷罚符',
        description: '对最近敌人释放雷电AOE',
        durability: 15,
        damage: 45,
        interval: 2.0,
        range: 60,
        aoeRadius: 12,
        color: 0xaa88ff,
      },
      ironguard: {
        name: '金刚符',
        description: '持续恢复生命力',
        durability: 15,
        healAmount: 8,
        interval: 3.0,
        color: 0x88ff44,
      },
    },
  },

  // ─── Progression ───
  progression: {
    totalLevels: 6,
    bossLevels: [3, 6],
    wavesPerLevel: 4,
    waveRestTime: 2,
    scaling: {
      hpPerLevel: 1.2,
      damagePerLevel: 1.1,
      enemyCountBase: 4,
      enemyCountPerLevel: 2,
      speedPerLevel: 1.05,
    },
    arenaScaling: {
      buildingsPerLevel: 2,
      spreadPerLevel: 30,
    },
    unlocks: [] as Array<{ level: number; type: string; id: string }>,
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
