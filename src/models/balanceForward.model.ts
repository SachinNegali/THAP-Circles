import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IBalanceForward extends Document {
  group: Types.ObjectId;
  fromUser: Types.ObjectId;
  toUser: Types.ObjectId;
  amount: number;
  fromCycle: Types.ObjectId;
  toCycle: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

type BalanceForwardModel = Model<IBalanceForward>;

const balanceForwardSchema = new Schema<IBalanceForward>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    fromCycle: { type: Schema.Types.ObjectId, ref: 'ExpenseCycle', required: true },
    toCycle: { type: Schema.Types.ObjectId, ref: 'ExpenseCycle', required: true },
  },
  { timestamps: true }
);

balanceForwardSchema.index({ group: 1, toCycle: 1 });

const BalanceForward = (mongoose.models['BalanceForward'] as BalanceForwardModel) ||
  mongoose.model<IBalanceForward>('BalanceForward', balanceForwardSchema);

export default BalanceForward;
