import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type SettlementStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';

export interface ISettlement extends Document {
  cycle: Types.ObjectId;
  group: Types.ObjectId;
  fromUser: Types.ObjectId;
  toUser: Types.ObjectId;
  amount: number;
  status: SettlementStatus;
  initiatedBy: Types.ObjectId;
  initiatedAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type SettlementModel = Model<ISettlement>;

const settlementSchema = new Schema<ISettlement>(
  {
    cycle: { type: Schema.Types.ObjectId, ref: 'ExpenseCycle', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending_confirmation', 'confirmed', 'cancelled'],
      default: 'pending_confirmation',
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Settlement = (mongoose.models['Settlement'] as SettlementModel) ||
  mongoose.model<ISettlement>('Settlement', settlementSchema);

export default Settlement;
