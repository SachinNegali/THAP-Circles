/**
 * Device Model — TypeScript
 * ===========================
 *
 * One record per user — uniqueness is enforced at the userId level
 * (not device-id) because the current schema treats the latest device
 * registration for a user as the source of truth for push delivery.
 */

import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type DevicePlatform = 'ios' | 'android';

export interface IDevice extends Document {
  userId: Types.ObjectId;
  deviceName?: string;
  platform: DevicePlatform;
  pushToken: string | null;
  lastActiveAt: Date;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceModel = Model<IDevice>;

const deviceSchema = new Schema<IDevice>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceName: { type: String, trim: true, maxlength: 100 },
    platform: {
      type: String,
      enum: ['ios', 'android'],
      required: true,
    },
    pushToken: { type: String, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceSchema.index({ userId: 1 }, { unique: true });
deviceSchema.index({ userId: 1, lastActiveAt: -1 });

const Device = (mongoose.models['Device'] as DeviceModel) ||
  mongoose.model<IDevice>('Device', deviceSchema);

export default Device;
