import TripLocationTrail from '../models/tripLocationTrail.model.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'tracking-snapshot' });

const FLUSH_INTERVAL_MS = parseInt(process.env.TRACKING_FLUSH_INTERVAL_MS || '90000', 10);
const JITTER_MS = 10_000;
const MAX_BATCH = 5000;

// groupId -> Set<userId>. A user is "dirty" if they broadcast at least one
// new frame since the last flush. Cleared on each flush.
const dirtyUsers = new Map();

/** Mark a user as having new data to persist on the next flush tick. */
export function markDirty(groupId, userId) {
  let set = dirtyUsers.get(groupId);
  if (!set) {
    set = new Set();
    dirtyUsers.set(groupId, set);
  }
  set.add(userId);
}

/** Drop a user's dirty flag (e.g., on WS close with no pending flush). */
export function clearDirty(groupId, userId) {
  const set = dirtyUsers.get(groupId);
  if (!set) return;
  set.delete(userId);
  if (set.size === 0) dirtyUsers.delete(groupId);
}

/**
 * Flush all dirty (groupId, userId) pairs into TripLocationTrail in a single
 * insertMany. Position data is read from the caller-supplied lookup so this
 * service stays decoupled from trackingServer's in-memory Maps.
 *
 * @param {(groupId: string, userId: string) => {lat:number,lng:number,ts:number}|null} getPosition
 */
export async function flushNow(getPosition) {
  if (dirtyUsers.size === 0) return { inserted: 0, groups: 0 };

  const docs = [];
  const now = new Date();
  const snapshot = dirtyUsers;
  dirtyUsers.clear(); // swap-out: new dirty entries during flush land in the next cycle

  let groupCount = 0;
  for (const [groupId, users] of snapshot) {
    groupCount++;
    for (const userId of users) {
      const pos = getPosition(groupId, userId);
      if (!pos) continue;
      docs.push({
        groupId,
        userId,
        lat: pos.lat,
        lng: pos.lng,
        ts: new Date(pos.ts || now),
        capturedAt: now,
      });
      if (docs.length >= MAX_BATCH) break;
    }
    if (docs.length >= MAX_BATCH) break;
  }

  if (docs.length === 0) return { inserted: 0, groups: groupCount };

  try {
    await TripLocationTrail.insertMany(docs, { ordered: false });
    log.info({ inserted: docs.length, groups: groupCount }, 'Trail flush OK');
    return { inserted: docs.length, groups: groupCount };
  } catch (err) {
    // `ordered: false` means partial writes succeed; log and move on.
    log.warn({ err, count: docs.length }, 'Trail flush partial/failed');
    return { inserted: docs.length, groups: groupCount, err };
  }
}

/** Start the periodic flusher. Returns a stop() fn. */
export function startFlusher(getPosition) {
  const jitter = Math.floor(Math.random() * JITTER_MS);
  log.info({ intervalMs: FLUSH_INTERVAL_MS, jitterMs: jitter }, 'Starting tracking flusher');

  let timer = null;
  const start = setTimeout(() => {
    timer = setInterval(() => {
      flushNow(getPosition).catch((err) => log.error({ err }, 'flushNow threw'));
    }, FLUSH_INTERVAL_MS);
  }, jitter);

  return async () => {
    clearTimeout(start);
    if (timer) clearInterval(timer);
    await flushNow(getPosition); // final drain on shutdown
  };
}
