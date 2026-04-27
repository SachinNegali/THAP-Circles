import redis from '../config/redis.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'tracking-state' });

const TTL_SEC = parseInt(process.env.TRACKING_REDIS_TTL_SEC || '900', 10); // 15 min

const rosterKey = (g) => `trk:roster:${g}`;
const framesKey = (g) => `trk:frames:${g}`;
const posKey = (g) => `trk:pos:${g}`;
const userInfoKey = (g) => `trk:userinfo:${g}`;

/** Fire-and-forget wrapper — never block the relay path on Redis errors. */
function swallow(promise, op) {
  promise.catch((err) => log.warn({ err, op }, 'Redis mirror op failed'));
}

export function mirrorRoster(groupId, numericId, userId) {
  swallow(
    redis
      .multi()
      .hset(rosterKey(groupId), numericId, userId)
      .expire(rosterKey(groupId), TTL_SEC)
      .exec(),
    'mirrorRoster'
  );
}

export function mirrorRemoveRoster(groupId, numericId, userId) {
  swallow(
    redis
      .multi()
      .hdel(rosterKey(groupId), numericId)
      .hdel(framesKey(groupId), userId)
      .hdel(posKey(groupId), userId)
      .hdel(userInfoKey(groupId), userId)
      .exec(),
    'mirrorRemoveRoster'
  );
}

export function mirrorUserInfo(groupId, userId, info) {
  swallow(
    redis
      .multi()
      .hset(userInfoKey(groupId), userId, JSON.stringify(info))
      .expire(userInfoKey(groupId), TTL_SEC)
      .exec(),
    'mirrorUserInfo'
  );
}

export function mirrorFrame(groupId, userId, buffer) {
  const b64 = Buffer.isBuffer(buffer)
    ? buffer.toString('base64')
    : Buffer.from(buffer).toString('base64');
  swallow(
    redis
      .multi()
      .hset(framesKey(groupId), userId, b64)
      .expire(framesKey(groupId), TTL_SEC)
      .exec(),
    'mirrorFrame'
  );
}

export function mirrorPosition(groupId, userId, lat, lng) {
  swallow(
    redis
      .multi()
      .hset(posKey(groupId), userId, `${lat},${lng}`)
      .expire(posKey(groupId), TTL_SEC)
      .exec(),
    'mirrorPosition'
  );
}

/**
 * Hydrate in-memory state for a group from Redis (used on WS open when the
 * group isn't known to this process — i.e., after a restart).
 * Returns { roster: Map<numericId, userId>, frames: Map<userId, Buffer>, positions: Map<userId, {lat,lng}> }
 * or null if Redis is cold for this group.
 */
export async function hydrateGroup(groupId) {
  try {
    const [rosterRaw, framesRaw, posRaw, userInfoRaw] = await Promise.all([
      redis.hgetall(rosterKey(groupId)),
      redis.hgetall(framesKey(groupId)),
      redis.hgetall(posKey(groupId)),
      redis.hgetall(userInfoKey(groupId)),
    ]);

    const hasAny =
      Object.keys(rosterRaw).length ||
      Object.keys(framesRaw).length ||
      Object.keys(posRaw).length ||
      Object.keys(userInfoRaw).length;
    if (!hasAny) return null;

    const roster = new Map();
    for (const [nid, oid] of Object.entries(rosterRaw)) {
      roster.set(parseInt(nid, 10), oid);
    }

    const frames = new Map();
    for (const [uid, b64] of Object.entries(framesRaw)) {
      frames.set(uid, Buffer.from(b64, 'base64'));
    }

    const positions = new Map();
    for (const [uid, pair] of Object.entries(posRaw)) {
      const [lat, lng] = pair.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        positions.set(uid, { lat, lng });
      }
    }

    const userInfo = new Map();
    for (const [uid, json] of Object.entries(userInfoRaw)) {
      try { userInfo.set(uid, JSON.parse(json)); } catch (_) { /* ignore corrupt entry */ }
    }

    return { roster, frames, positions, userInfo };
  } catch (err) {
    log.warn({ err, groupId }, 'hydrateGroup failed — starting cold');
    return null;
  }
}
