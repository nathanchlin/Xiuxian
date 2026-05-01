/**
 * Global game configuration for XianxiaAirCombat.
 * All tunable parameters in one place. Hot-reloads via Vite HMR.
 */

// ─── Computed: Cultivation exp table (50*n²) ───
const CULTIVATION_MAX = 50;
const expPerLevelTable: number[] = [0];
for (let i = 1; i <= CULTIVATION_MAX; i++) expPerLevelTable.push(Math.round(50 * i * i));

// ─── Computed: Boss levels (every 5) and major boss levels (every 10) ───
const bossLevels: number[] = [];
for (let i = 5; i <= 100; i += 5) bossLevels.push(i);
const majorBossLevels: number[] = [];
for (let i = 10; i <= 100; i += 10) majorBossLevels.push(i);

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
    regenRate: 8,
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
      name: '万剑齐发',
      spiritCost: 12,
      cooldown: 3,
      damage: 20,
      range: 100,
      projectileSpeed: 70,
      projectileRadius: 1.5,
      fanAngle: Math.PI / 6,
      bladeCount: 12,
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
    combo: {
      timeout: 4.0,
      damagePerHit: 0.05,
      maxMultiplier: 3.0,
    },
  },

  // ─── Combat ───
  combat: {
    critChance: 0.15,
    critMultiplier: 1.75,
  },

  // ─── Player ───
  player: {
    maxHealth: 200,
    hpPerGameLevel: 8,
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
      phoenix: {
        name: '凤凰',
        hp: 500,
        speed: 35,
        attackDamage: 8,
        chargeDamage: 12,
        attackType: 'fireball' as const,
        color: 0xff4400,
        scale: 2.0,
      },
    },
    scaling: {
      hpPerLevel: 0.04,
      damagePerLevel: 0.03,
      speedPerLevel: 0.008,
    },
    engageDistance: 80,
    fleeHpPercent: 0.2,
    avoidDistance: 15,
  },

  // ─── Boss ───
  boss: {
    baseHp: 250,
    baseDamage: 15,
    damagePerLevel: 0.05,
    phase1Threshold: 0.6,
    phase2Threshold: 0.3,
    phase2SpeedBoost: 1.5,
    phase3SpeedBoost: 1.3,
    baseSummonCount: 2,
    summonPerLevel: 0.05,
    baseShieldHp: 80,
    shieldPerLevel: 2,
    color: 0xcc00ff,
  },

  // ─── Arena ───
  arena: {
    levelConfigs: [
      { buildings: 8, bridges: 3, islands: 5, spread: 200, skyTint: '#0a0a3e' },
      { buildings: 12, bridges: 5, islands: 8, spread: 300, skyTint: '#1a0a2e' },
      { buildings: 15, bridges: 6, islands: 10, spread: 400, skyTint: '#2a1a1e' },
    ] as Array<{ buildings: number; bridges: number; islands: number; spread: number; skyTint: string }>,
    skyTintPresets: ['#0a0a3e', '#0a1a2e', '#1a0a2e', '#2a1a1e', '#1a2a0a', '#2a2a0a'],
    buildingMinGap: 20,
    heightRange: [30, 120] as [number, number],
    islandRadius: [1, 3] as [number, number],
    buildingsPerLevel: 1,
    spreadPerLevel: 15,
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
      phoenix: 0.40,
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
    totalLevels: 100,
    bossLevels: bossLevels as readonly number[],
    majorBossLevels: majorBossLevels as readonly number[],
    realms: [
      { name: '炼气', startLevel: 1, endLevel: 10 },
      { name: '筑基', startLevel: 11, endLevel: 30 },
      { name: '结丹', startLevel: 31, endLevel: 50 },
      { name: '元婴', startLevel: 51, endLevel: 70 },
      { name: '化神', startLevel: 71, endLevel: 90 },
      { name: '飞升', startLevel: 91, endLevel: 100 },
    ] as readonly { name: string; startLevel: number; endLevel: number }[],
    wavesPerLevel: 4,
    waveRestTime: 2,
    scaling: {
    },
    arenaScaling: {
      buildingsPerLevel: 1,
      spreadPerLevel: 15,
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

  // ─── Items & Loot ───
  items: {
    skillBooks: {
      skill_bladefan:  { name: '万剑秘卷', skill: 'bladeFan',   color: 0x44ffcc, description: '万剑齐发 +1级' },
      skill_sworddash: { name: '御剑心法', skill: 'swordDash',  color: 0x00ffcc, description: '御剑突刺 +1级' },
      skill_parry:     { name: '护体剑诀', skill: 'parry',      color: 0xffd700, description: '剑气护体 +1级' },
      skill_final:     { name: '归宗真解', skill: 'finalStrike', color: 0xffd700, description: '万剑归宗 +1级' },
    } as Record<string, { name: string; skill: string; color: number; description: string }>,
    treasures: {
      sword_purple:  { name: '紫电剑', quality: 'rare',   color: 0x8844ff, description: '攻击+15%',     stat: 'damage',     value: 0.15 },
      shield_turtle: { name: '玄龟盾', quality: 'rare',   color: 0x44aaff, description: '护盾时间+0.5s', stat: 'parryWindow', value: 0.5 },
      wind_pearl:    { name: '风灵珠', quality: 'rare',   color: 0x88ffaa, description: '移速+10%',     stat: 'speed',      value: 0.10 },
      fire_ring:     { name: '焚天环', quality: 'epic',   color: 0xff6644, description: '攻击+25%',     stat: 'damage',     value: 0.25 },
      jade_pendant:  { name: '碧玉坠', quality: 'common', color: 0xaaffaa, description: 'HP上限+15%',   stat: 'hp',         value: 0.15 },
      spirit_gourd:  { name: '聚灵葫', quality: 'common', color: 0x6688ff, description: '灵力上限+15%', stat: 'spirit',     value: 0.15 },
    } as Record<string, { name: string; quality: string; color: number; description: string; stat: string; value: number }>,
    consumables: {
      pill_hp:     { name: '回血丹', color: 0xff4444, description: '恢复50生命', effect: 'hp',      value: 50 },
      pill_spirit: { name: '聚灵丹', color: 0x4488ff, description: '恢复40灵力', effect: 'spirit',  value: 40 },
      pill_shield: { name: '无敌符', color: 0xffdd00, description: '3秒无敌',   effect: 'invincible', value: 3 },
    } as Record<string, { name: string; color: number; description: string; effect: string; value: number }>,
    cultivation: {
      expPerLevel: expPerLevelTable as readonly number[],
      maxLevel: CULTIVATION_MAX,
      bonusPerLevel: 0.03,
      dropAmounts: { crow: 5, serpent: 15, dragon: 30, phoenix: 60, boss: 100 } as Record<string, number>,
    },
    dropTable: {
      crow:    { cultivationExp: 1.0, consumable: 0.20, skillBook: 0.05, treasure: 0.0  },
      serpent: { cultivationExp: 1.0, consumable: 0.25, skillBook: 0.15, treasure: 0.05 },
      dragon:  { cultivationExp: 1.0, consumable: 0.30, skillBook: 0.30, treasure: 0.10 },
      phoenix: { cultivationExp: 1.0, consumable: 0.35, skillBook: 0.20, treasure: 0.15 },
      boss:    { cultivationExp: 1.0, consumable: 0.50, skillBook: 1.0,  treasure: 0.50 },
    } as Record<string, { cultivationExp: number; consumable: number; skillBook: number; treasure: number }>,
    qualityColors: {
      common: 0xcccccc,
      rare: 0x4488ff,
      epic: 0xffd700,
    } as Record<string, number>,
  },
} as const;
