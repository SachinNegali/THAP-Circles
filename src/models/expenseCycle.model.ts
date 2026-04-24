import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type CycleStatus = 'active' | 'closed';

export interface IExpenseCycle extends Document {
  group: Types.ObjectId;
  status: CycleStatus;
  currency: string;
  createdBy: Types.ObjectId;
  startedAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseCycleModel = Model<IExpenseCycle>;

const expenseCycleSchema = new Schema<IExpenseCycle>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    currency: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
  },
  { timestamps: true }
);

expenseCycleSchema.index({ group: 1, status: 1 });

const ExpenseCycle = (mongoose.models['ExpenseCycle'] as ExpenseCycleModel) ||
  mongoose.model<IExpenseCycle>('ExpenseCycle', expenseCycleSchema);

export default ExpenseCycle;
