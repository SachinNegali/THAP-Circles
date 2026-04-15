import ExpenseComment from '../models/expenseComment.model.js';
import Expense from '../models/expense.model.js';
import { ExpenseError } from '../utils/expenseErrors.js';

export const addComment = async (groupId, expenseId, userId, text) => {
  if (!text || !text.trim()) {
    throw new ExpenseError('INVALID_COMMENT', 'text is required', 422);
  }

  const expense = await Expense.findById(expenseId);
  if (!expense || expense.isDeleted || expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.createdBy.toString() !== userId.toString()) {
    throw new ExpenseError(
      'NOT_EXPENSE_CREATOR',
      'Only the expense creator can post comments',
      403
    );
  }

  return ExpenseComment.create({
    expense: expense._id,
    user: userId,
    text: text.trim(),
  });
};

export const listComments = async (groupId, expenseId) => {
  const expense = await Expense.findById(expenseId);
  if (!expense || expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  return ExpenseComment.find({ expense: expenseId })
    .sort({ createdAt: 1 })
    .populate('user', 'fName lName');
};
