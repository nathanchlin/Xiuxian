import { CONFIG } from '../config';

export type EnemyTypeName = 'crow' | 'serpent' | 'dragon';

export interface EnemyTypeConfig {
  name: string;
  hp: number;
  speed: number;
  attackDamage: number;
  attackType: string;
  color: number;
  scale: number;
}

export function getEnemyConfig(type: EnemyTypeName, level: number): EnemyTypeConfig {
  const base = CONFIG.enemies.types[type];
  const scaling = CONFIG.enemies.scaling;
  const hpMult = 1 + scaling.hpPerLevel * level;
  const dmgMult = 1 + scaling.damagePerLevel * level;

  return {
    name: base.name,
    hp: Math.round(base.hp * hpMult),
    speed: base.speed * (1 + scaling.speedPerLevel * level),
    attackDamage: Math.round(base.attackDamage * dmgMult),
    attackType: base.attackType,
    color: base.color,
    scale: base.scale,
  };
}
