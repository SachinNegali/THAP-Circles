import mongoose, { Types } from 'mongoose';

const settlementSchema = new mongoose.Schema(
  {
    cycle: { type: Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Types.ObjectId, ref: 'Group', required: true },
    fromUser: { type: Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending_confirmation', 'confirmed', 'cancelled'],
      default: 'pending_confirmation',
    },
    initiatedBy: { type: Types.ObjectId, ref: 'User', required: true },
    initiatedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Reuse existing model if already registered (avoids conflict with TS version)
const Settlement = mongoose.models.Settlement || mongoose.model('Settlement', settlementSchema);

export default Settlement;
