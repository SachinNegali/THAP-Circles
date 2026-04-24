import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type SplitType = 'equal' | 'custom';

export interface IExpense extends Document {
  cycle: Types.ObjectId;
  group: Types.ObjectId;
  message: Types.ObjectId;
  paidBy: Types.ObjectId;
  amount: number;
  category: string;
  note: string;
  imageUrl: string | null;
  splitType: SplitType;
  createdBy: Types.ObjectId;
  editableUntil: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseModel = Model<IExpense>;

const expenseSchema = new Schema<IExpense>(
  {
    cycle: { type: Schema.Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    message: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, required: true, trim: true, maxlength: 50 },
    note: { type: String, default: '', maxlength: 500 },
    imageUrl: { type: String, default: null },
    splitType: { type: String, enum: ['equal', 'custom'], default: 'equal' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    editableUntil: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

expenseSchema.index({ group: 1, cycle: 1, createdAt: -1 });
expenseSchema.index({ group: 1, category: 1 });

const Expense = (mongoose.models['Expense'] as ExpenseModel) ||
  mongoose.model<IExpense>('Expense', expenseSchema);

export default Expense;
