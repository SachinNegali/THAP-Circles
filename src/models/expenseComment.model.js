import mongoose, { Types } from 'mongoose';

const expenseCommentSchema = new mongoose.Schema(
  {
    expense: { type: Types.ObjectId, ref: 'Expense', required: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true }
);

// Reuse existing model if already registered (avoids conflict with TS version)
const ExpenseComment = mongoose.models.ExpenseComment || mongoose.model('ExpenseComment', expenseCommentSchema);

export default ExpenseComment;
