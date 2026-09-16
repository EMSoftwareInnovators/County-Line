/* ============================================================
   player.js -- the first-person controller.

   The FEEL is Final Rental's and is deliberately unchanged: the same
   walk and run speeds, the same acceleration, the same head bob and the
   same mouse and stick handling, because that controller was responsive
   and predictable and there is no reason to relearn it. The numbers now
   live in units.js where the rest of the building can be measured
   against them.

   The MOVEMENT is not. Final Rental's player had an x and a z and an eye
   height that never changed, because the store had one floor. This one
   has a y, a vertical velocity, a crouch, and a body that the collision
   world moves rather than a pair of coordinates the controller assigns.
   That is what makes stairs, landings and stepping off a curb work.

   What is DELIBERATELY ABSENT: jumping, mantling, vaulting, sliding,
   sprinting-with-stamina, lean, and anything else that would turn walking
   round a building into a mechanic. County Line is grounded first-person
   horror and the floor is the floor.
   ============================================================ */
import { mat, mul, setRotX, setRotY, setTranslate, clamp, approach } from '../engine/mathx.js';
import { SCALE, eyeAt, standAt } from '../engine/units.js';

/** How far the player can pitch. Just short of straight up and down. */
const PITCH_LIMIT = 1.45;

export function createPlayer(spawn) {
  return {
    x: spawn ? spawn.x : 0,
    y: spawn ? spawn.y : 0,
    z: spawn ? spawn.z : 0,
    yaw: spawn ? (spawn.yaw || 0) : 0,
    pitch: spawn && spawn.pitch !== undefined ? spawn.pitch : 0,

    vx: 0, vz: 0, vy: 0,
    r: SCALE.playerRadius,
    height: SCALE.playerHeight,
    step: SCALE.stepHeight,
    grounded: true,

    /** 0 standing, 1 fully crouched. Animated, so the camera does not snap. */
    crouch: 0,
    /** Camera height above the feet, including the crouch and the bob. */
    eye: SCALE.playerEye,

    bob: 0, bobPhase: 0, roll: 0,
    stepTimer: 0,
    /** What the feet are on, for the footstep sound and the debug read-out. */
    surface: null,
    /** Set while a cutscene or a menu owns the body. */
    frozen: false,
  };
}

const _cam = mat(), _t = mat(), _r = mat();

/** World matrix for the camera: position, yaw, then pitch. */
export function buildCamera(p, out) {
  setTranslate(_t, p.x, p.y + p.eye + p.bob, p.z);
  setRotY(_r, p.yaw);
  mul(_cam, _t, _r);
  setRotX(_r, -p.pitch);
  mul(out, _cam, _r);
  return out;
}

/** Unit vector the camera is looking along. */
export function forwardOf(p) {
  const cp = Math.cos(p.pitch);
  return [Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp];
}

/** Where the interaction ray starts. */
export function eyePoint(p) {
  return { x: p.x, y: p.y + p.eye + p.bob, z: p.z };
}

/**
 * @param ctx {
 *   collision,                 a CollisionWorld
 *   onStep(material, running), a footstep landed
 *   onLand(height),            the player arrived on the ground from a fall
 * }
 * @returns the horizontal speed, in meters per second
 */
export function updatePlayer(p, dt, input, ctx) {
  /* ---- looking ---- */
  if (!p.frozen) {
    if (input.locked) {
      // mouse deltas are raw counts and are already frame-independent
      p.yaw += input.mdx * input.sensitivity;
      p.pitch -= input.mdy * input.sensitivity * (input.invertY ? -1 : 1);
    }
    if (input.lookX || input.lookY) {
      // a stick is a rate, so it is scaled by the frame
      const k = input.padSensitivity * dt * (0.35 + input.sensitivity * 200);
      p.yaw += input.lookX * k;
      p.pitch -= input.lookY * k * (input.invertY ? -1 : 1) * 0.82;
    }
    p.pitch = clamp(p.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /* ---- stance ----
     Standing up is refused while there is something overhead, which is
     what stops the player standing into the underside of a stair. */
  const wantCrouch = !p.frozen && input.isDown('crouch');
  if (!wantCrouch && p.crouch > 0) {
    const head = ctx.collision.ceilingAt(p.x, p.z, p.y + 0.1);
    if (head - p.y < SCALE.playerHeight + 0.05) {
      // no room; stay down
    } else p.crouch = approach(p.crouch, 0, 9, dt);
  } else if (wantCrouch) {
    p.crouch = approach(p.crouch, 1, 9, dt);
  }
  if (p.crouch < 0.002) p.crouch = 0;
  if (p.crouch > 0.998) p.crouch = 1;
  p.height = standAt(p.crouch);
  p.eye = eyeAt(p.crouch);

  /* ---- walking ---- */
  let mx = 0, mz = 0;
  if (!p.frozen) { mx = input.moveX || 0; mz = input.moveZ || 0; }
  const running = !p.frozen && input.isDown('run') && p.crouch < 0.5;
  const len = Math.hypot(mx, mz);
  const base = p.crouch > 0.5 ? SCALE.crouchSpeed : (running ? SCALE.runSpeed : SCALE.walkSpeed);
  // a stick honours its own throw; a key is all or nothing
  const speed = base * Math.min(1, len || 1);

  let ax = 0, az = 0;
  if (len > 0) {
    mx /= len; mz /= len;
    // forward is +Z at yaw 0; right is +X
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    ax = (fx * mz + rx * mx) * speed;
    az = (fz * mz + rz * mx) * speed;
  }
  /* Slightly quicker to stop than to start, which is what makes a stop on
     a staircase feel deliberate rather than slithery. */
  const accel = len > 0 ? 13 : 15;
  p.vx += (ax - p.vx) * Math.min(1, dt * accel);
  p.vz += (az - p.vz) * Math.min(1, dt * accel);
  /* In the air the player keeps whatever they had. There is no jump, so
     this only ever applies to walking off something. */
  if (!p.grounded) { p.vx *= 1 - Math.min(1, dt * 0.8); p.vz *= 1 - Math.min(1, dt * 0.8); }

  const fellFrom = p.y;
  const res = ctx.collision.move(p, p.vx * dt, p.vz * dt, dt);
  // kill the velocity component into whatever we just slid along
  if (res.blockedX) p.vx *= 0.2;
  if (res.blockedZ) p.vz *= 0.2;
  p.surface = res.ground;

  if (res.landed && fellFrom - p.y > 0.4 && ctx.onLand) ctx.onLand(fellFrom - p.y);

  /* ---- head ---- */
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > 0.25 && p.grounded) {
    p.bobPhase += dt * (running ? 12.5 : 8.4) * (p.crouch > 0.5 ? 0.7 : 1);
    p.bob = Math.sin(p.bobPhase) * (running ? 0.045 : 0.026);
    p.roll = Math.cos(p.bobPhase * 0.5) * (running ? 0.014 : 0.008);
    p.stepTimer -= dt * sp;
    if (p.stepTimer <= 0) {
      p.stepTimer = running ? 0.82 : 0.62;
      if (ctx.onStep) ctx.onStep(materialUnder(p), running);
    }
  } else {
    // a barely-there sway, so a standing player is not a tripod
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.0011;
    p.bob += (Math.sin(t) * 0.004 - p.bob) * Math.min(1, dt * 4);
    p.roll += (0 - p.roll) * Math.min(1, dt * 6);
  }
  return sp;
}

/** What the feet are on, as a name the audio layer understands. */
export function materialUnder(p) {
  const s = p.surface;
  if (!s) return 'default';
  return s.material || (s.tag === 'stair' ? 'wood' : 'default');
}
