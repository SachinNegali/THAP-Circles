import mongoose, { Types } from 'mongoose';

const balanceForwardSchema = new mongoose.Schema(
  {
    group: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
    fromUser: { type: Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    fromCycle: { type: Types.ObjectId, ref: 'ExpenseCycle', required: true },
    toCycle: { type: Types.ObjectId, ref: 'ExpenseCycle', required: true },
  },
  { timestamps: true }
);

balanceForwardSchema.index({ group: 1, toCycle: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const BalanceForward = mongoose.models.BalanceForward || mongoose.model('BalanceForward', balanceForwardSchema);

export default BalanceForward;
