import mongoose, { Types } from 'mongoose';

const expenseCycleSchema = new mongoose.Schema(
  {
    group: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    currency: { type: String, required: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
  },
  { timestamps: true }
);

expenseCycleSchema.index({ group: 1, status: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const ExpenseCycle = mongoose.models.ExpenseCycle || mongoose.model('ExpenseCycle', expenseCycleSchema);

export default ExpenseCycle;
