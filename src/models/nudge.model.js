import mongoose, { Types } from 'mongoose';

const nudgeSchema = new mongoose.Schema(
  {
    group: { type: Types.ObjectId, ref: 'Group', required: true },
    fromUser: { type: Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    sentAt: { type: Date, default: Date.now },
    nextAllowedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

nudgeSchema.index({ group: 1, fromUser: 1, toUser: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const Nudge = mongoose.models.Nudge || mongoose.model('Nudge', nudgeSchema);

export default Nudge;
