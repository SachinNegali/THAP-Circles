import mongoose, { Types } from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    cycle: { type: Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
    message: { type: Types.ObjectId, ref: 'Message', required: true },
    paidBy: { type: Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, required: true, trim: true, maxlength: 50 },
    note: { type: String, default: '', maxlength: 500 },
    imageUrl: { type: String, default: null },
    splitType: { type: String, enum: ['equal', 'custom'], default: 'equal' },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    editableUntil: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

expenseSchema.index({ group: 1, cycle: 1, createdAt: -1 });
expenseSchema.index({ group: 1, category: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);

export default Expense;
