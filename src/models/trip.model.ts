/**
 * Trip Model — TypeScript
 * ========================
 *
 * Mirrors the legacy JS model; adds typed document methods. Registration
 * is guarded so the JS and TS versions can coexist during migration.
 */

import mongoose, {
  Document,
  HydratedDocument,
  Model,
  Schema,
  Types,
} from 'mongoose';

export type LocationType = 'point' | 'area' | 'city';

export interface ILocation {
  type: LocationType;
  name: string;
  coordinates?: { lat?: number; lng?: number };
  city?: string;
  area?: string;
}

export interface ITripParticipant {
  user: Types.ObjectId;
  joinedAt: Date;
}

export interface ITripJoinRequest {
  user: Types.ObjectId;
  requestedAt: Date;
}

export interface ITrip {
  title: string;
  description?: string;
  startLocation: ILocation;
  destination: ILocation;
  stops: ILocation[];
  createdBy: Types.ObjectId;
  participants: ITripParticipant[];
  joinRequests: ITripJoinRequest[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  trackingGroupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITripMethods {
  isParticipant(userId: string | Types.ObjectId): boolean;
  isCreator(userId: string | Types.ObjectId): boolean;
  addParticipant(userId: string | Types.ObjectId): Promise<TripDocument>;
  removeParticipant(userId: string | Types.ObjectId): Promise<TripDocument>;
  getParticipantCount(): number;
  hasJoinRequest(userId: string | Types.ObjectId): boolean;
  addJoinRequest(userId: string | Types.ObjectId): Promise<TripDocument>;
  removeJoinRequest(userId: string | Types.ObjectId): Promise<TripDocument>;
}

export type TripDocument = HydratedDocument<ITrip, ITripMethods>;
export type TripModel = Model<ITrip, Record<string, never>, ITripMethods>;

const locationSchema = new Schema<ILocation>(
  {
    type: { type: String, enum: ['point', 'area', 'city'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    city: { type: String, trim: true, maxlength: 100 },
    area: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

const tripSchema = new Schema<ITrip, TripModel, ITripMethods>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    startLocation: { type: locationSchema, required: true },
    destination: { type: locationSchema, required: true },
    stops: { type: [locationSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    joinRequests: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        requestedAt: { type: Date, default: Date.now },
      },
    ],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    trackingGroupId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

tripSchema.index({ createdBy: 1, isActive: 1 });
tripSchema.index({ 'participants.user': 1, isActive: 1 });
tripSchema.index({ startDate: 1, isActive: 1 });
tripSchema.index({ isActive: 1, startDate: -1 });

tripSchema.pre('save', function (this: TripDocument) {
  if (this.endDate <= this.startDate) {
    throw new Error('End date must be after start date');
  }
});

/** Helper to compare a ref field (either ObjectId or populated subdoc). */
const refIdEquals = (
  ref: Types.ObjectId | { _id?: Types.ObjectId } | undefined,
  target: string | Types.ObjectId
): boolean => {
  if (!ref) return false;
  const refId =
    (ref as { _id?: Types.ObjectId })._id ?? (ref as Types.ObjectId);
  return refId.toString() === target.toString();
};

tripSchema.methods['isParticipant'] = function (
  this: TripDocument,
  userId: string | Types.ObjectId
): boolean {
  return this.participants.some((p) => refIdEquals(p.user as unknown as Types.ObjectId, userId));
};

tripSchema.methods['isCreator'] = function (
  this: TripDocument,
  userId: string | Types.ObjectId
): boolean {
  return refIdEquals(this.createdBy as unknown as Types.ObjectId, userId);
};

tripSchema.methods['addParticipant'] = async function (
  this: TripDocument,
  userId: string | Types.ObjectId
): Promise<TripDocument> {
  if (this.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }
  this.participants.push({
    user: new Types.ObjectId(userId.toString()),
    joinedAt: new Date(),
  });
  return this.save();
};

tripSchema.methods['removeParticipant'] = async function (
  this: TripDocument,
  userId: string | Types.ObjectId
): Promise<TripDocument> {
  const idx = this.participants.findIndex(
    (p) => p.user.toString() === userId.toString()
  );
  if (idx === -1) {
    throw new Error('User is not a participant');
  }
  this.participants.splice(idx, 1);
  return this.save();
};

tripSchema.methods['getParticipantCount'] = function (this: TripDocument): number {
  return this.participants.length;
};

tripSchema.methods['hasJoinRequest'] = function (
  this: TripDocument,
  userId: string | Types.ObjectId
): boolean {
  return this.joinRequests.some((r) =>
    refIdEquals(r.user as unknown as Types.ObjectId, userId)
  );
};

tripSchema.methods['addJoinRequest'] = async function (
  this: TripDocument,
  userId: string | Types.ObjectId
): Promise<TripDocument> {
  if (this.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }
  if (this.hasJoinRequest(userId)) {
    throw new Error('Join request already exists');
  }
  this.joinRequests.push({
    user: new Types.ObjectId(userId.toString()),
    requestedAt: new Date(),
  });
  return this.save();
};

tripSchema.methods['removeJoinRequest'] = async function (
  this: TripDocument,
  userId: string | Types.ObjectId
): Promise<TripDocument> {
  const idx = this.joinRequests.findIndex(
    (r) => r.user.toString() === userId.toString()
  );
  if (idx === -1) return this;
  this.joinRequests.splice(idx, 1);
  return this.save();
};

/**
 * Reuse a previously-registered model so the coexisting legacy JS model
 * does not trigger OverwriteModelError.
 */
const Trip = (mongoose.models['Trip'] as TripModel) ||
  mongoose.model<ITrip, TripModel>('Trip', tripSchema);

export default Trip;
