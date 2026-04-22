import mongoose, { Types } from 'mongoose';

const TRAIL_TTL_DAYS = parseInt(process.env.TRACKING_TRAIL_TTL_DAYS || '7', 10);

const tripLocationTrailSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    ts: { type: Date, required: true },
    capturedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);

tripLocationTrailSchema.index({ groupId: 1, ts: 1 });
tripLocationTrailSchema.index({ groupId: 1, userId: 1, ts: -1 });
tripLocationTrailSchema.index(
  { capturedAt: 1 },
  { expireAfterSeconds: TRAIL_TTL_DAYS * 24 * 60 * 60 }
);

const TripLocationTrail = mongoose.model('TripLocationTrail', tripLocationTrailSchema);

export default TripLocationTrail;
