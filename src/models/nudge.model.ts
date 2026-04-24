import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface INudge extends Document {
  group: Types.ObjectId;
  fromUser: Types.ObjectId;
  toUser: Types.ObjectId;
  amount: number;
  sentAt: Date;
  nextAllowedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type NudgeModel = Model<INudge>;

const nudgeSchema = new Schema<INudge>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    sentAt: { type: Date, default: Date.now },
    nextAllowedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

nudgeSchema.index({ group: 1, fromUser: 1, toUser: 1 });

const Nudge = (mongoose.models['Nudge'] as NudgeModel) ||
  mongoose.model<INudge>('Nudge', nudgeSchema);

export default Nudge;
