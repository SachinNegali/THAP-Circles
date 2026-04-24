import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type SplitStatus = 'pending' | 'settlement_initiated' | 'settled';

export interface IExpenseSplit extends Document {
  expense: Types.ObjectId;
  cycle: Types.ObjectId;
  group: Types.ObjectId;
  user: Types.ObjectId;
  shareAmount: number;
  status: SplitStatus;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseSplitModel = Model<IExpenseSplit>;

const expenseSplitSchema = new Schema<IExpenseSplit>(
  {
    expense: { type: Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    cycle: { type: Schema.Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

const ExpenseSplit = (mongoose.models['ExpenseSplit'] as ExpenseSplitModel) ||
  mongoose.model<IExpenseSplit>('ExpenseSplit', expenseSplitSchema);

export default ExpenseSplit;
