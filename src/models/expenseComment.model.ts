import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IExpenseComment extends Document {
  expense: Types.ObjectId;
  user: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseCommentModel = Model<IExpenseComment>;

const expenseCommentSchema = new Schema<IExpenseComment>(
  {
    expense: { type: Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true }
);

const ExpenseComment = (mongoose.models['ExpenseComment'] as ExpenseCommentModel) ||
  mongoose.model<IExpenseComment>('ExpenseComment', expenseCommentSchema);

export default ExpenseComment;
