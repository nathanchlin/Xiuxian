export interface AABB2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface AABB3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface Ray3D {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Resolve a circle (XZ plane) against a list of 2D AABBs.
 * Pushes the circle center out of any penetrating walls.
 */
export function resolveCircleVsAABBs(
  x: number,
  z: number,
  radius: number,
  walls: AABB2D[],
): { x: number; z: number } {
  let rx = x, rz = z;
  for (const w of walls) {
    const cx = Math.max(w.minX, Math.min(rx, w.maxX));
    const cz = Math.max(w.minZ, Math.min(rz, w.maxZ));
    const dx = rx - cx;
    const dz = rz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      rx += (dx / dist) * push;
      rz += (dz / dist) * push;
    } else if (distSq === 0) {
      const edges = [
        { axis: 'x' as const, sign: -1, dist: rx - w.minX },
        { axis: 'x' as const, sign: 1, dist: w.maxX - rx },
        { axis: 'z' as const, sign: -1, dist: rz - w.minZ },
        { axis: 'z' as const, sign: 1, dist: w.maxZ - rz },
      ];
      edges.sort((a, b) => a.dist - b.dist);
      const e = edges[0]!;
      if (e.axis === 'x') rx += e.sign * (e.dist + radius);
      else rz += e.sign * (e.dist + radius);
    }
  }
  return { x: rx, z: rz };
}

/**
 * Check if a line segment from (ax,az) to (bx,bz) is blocked by any wall.
 * Returns true if the line is clear (no intersections).
 */
export function hasLineOfSight(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: AABB2D[],
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const w of walls) {
    let tmin = 0, tmax = 1;

    if (Math.abs(dx) > 1e-8) {
      const t1 = (w.minX - ax) / dx;
      const t2 = (w.maxX - ax) / dx;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
      if (tmin > tmax) continue;
    } else {
      if (ax < w.minX || ax > w.maxX) continue;
    }

    if (Math.abs(dz) > 1e-8) {
      const t1 = (w.minZ - az) / dz;
      const t2 = (w.maxZ - az) / dz;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
      if (tmin > tmax) continue;
    } else {
      if (az < w.minZ || az > w.maxZ) continue;
    }

    return false;
  }
  return true;
}

/**
 * 3D ray-vs-AABB intersection using slab method.
 * Returns the distance to intersection, or null if no hit.
 */
export function rayVsAABB3D(ray: Ray3D, box: AABB3D, maxDist: number): number | null {
  let tmin = 0;
  let tmax = maxDist;

  // X slab
  if (Math.abs(ray.dx) > 1e-8) {
    const t1 = (box.minX - ray.ox) / ray.dx;
    const t2 = (box.maxX - ray.ox) / ray.dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.ox < box.minX || ray.ox > box.maxX) return null;
  }

  // Y slab
  if (Math.abs(ray.dy) > 1e-8) {
    const t1 = (box.minY - ray.oy) / ray.dy;
    const t2 = (box.maxY - ray.oy) / ray.dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.oy < box.minY || ray.oy > box.maxY) return null;
  }

  // Z slab
  if (Math.abs(ray.dz) > 1e-8) {
    const t1 = (box.minZ - ray.oz) / ray.dz;
    const t2 = (box.maxZ - ray.oz) / ray.dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.oz < box.minZ || ray.oz > box.maxZ) return null;
  }

  return tmin;
}

/**
 * Build a look-direction vector from yaw and pitch (no Three.js dependency).
 * Matches Player.getLookDir() behavior: yaw rotates around Y, pitch rotates around X.
 */
export function lookDirection(yaw: number, pitch: number): { dx: number; dy: number; dz: number } {
  const cosPitch = Math.cos(pitch);
  return {
    dx: -Math.sin(yaw) * cosPitch,
    dy: Math.sin(pitch),
    dz: -Math.cos(yaw) * cosPitch,
  };
}

/**
 * Resolve a sphere against a list of 3D AABBs.
 * Pushes the sphere center out of any penetrating box, with bounce elasticity.
 */
export function resolveSphereVsAABB3Ds(
  x: number, y: number, z: number,
  radius: number,
  boxes: AABB3D[],
  elasticity = 0.3,
): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  let rx = x, ry = y, rz = z;
  let bounceVx = 0, bounceVy = 0, bounceVz = 0;

  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(rx, b.maxX));
    const cy = Math.max(b.minY, Math.min(ry, b.maxY));
    const cz = Math.max(b.minZ, Math.min(rz, b.maxZ));

    const dx = rx - cx;
    const dy = ry - cy;
    const dz = rz - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      rx += nx * push;
      ry += ny * push;
      rz += nz * push;
      bounceVx += nx * elasticity;
      bounceVy += ny * elasticity;
      bounceVz += nz * elasticity;
    } else if (distSq === 0) {
      const exits = [
        { axis: 'x' as const, sign: -1, d: rx - b.minX },
        { axis: 'x' as const, sign: 1, d: b.maxX - rx },
        { axis: 'y' as const, sign: -1, d: ry - b.minY },
        { axis: 'y' as const, sign: 1, d: b.maxY - ry },
        { axis: 'z' as const, sign: -1, d: rz - b.minZ },
        { axis: 'z' as const, sign: 1, d: b.maxZ - rz },
      ];
      exits.sort((a, b_) => a.d - b_.d);
      const e = exits[0]!;
      if (e.axis === 'x') { rx += e.sign * (e.d + radius); bounceVx += e.sign * elasticity; }
      else if (e.axis === 'y') { ry += e.sign * (e.d + radius); bounceVy += e.sign * elasticity; }
      else { rz += e.sign * (e.d + radius); bounceVz += e.sign * elasticity; }
    }
  }

  return { x: rx, y: ry, z: rz, vx: bounceVx, vy: bounceVy, vz: bounceVz };
}
