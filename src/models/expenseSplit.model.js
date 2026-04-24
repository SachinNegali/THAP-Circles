import mongoose, { Types } from 'mongoose';

const expenseSplitSchema = new mongoose.Schema(
  {
    expense: { type: Types.ObjectId, ref: 'Expense', required: true, index: true },
    cycle: { type: Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    shareAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'settlement_initiated', 'settled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

expenseSplitSchema.index({ cycle: 1, user: 1 });
expenseSplitSchema.index({ cycle: 1, status: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const ExpenseSplit = mongoose.models.ExpenseSplit || mongoose.model('ExpenseSplit', expenseSplitSchema);

export default ExpenseSplit;
