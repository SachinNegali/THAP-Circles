import mongoose from 'mongoose';
import Expense from '../models/expense.model.js';
import ExpenseSplit from '../models/expenseSplit.model.js';
import ExpenseCycle from '../models/expenseCycle.model.js';
import Message from '../models/message.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import sseManager from './sse.service.js';
import { broadcastNewMessage } from './message.service.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import { requireActiveCycle } from './expenseCycle.service.js';

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const TOLERANCE = 0.01;

const isGroupMember = (group, userId) =>
  group.members.some((m) => m.user.toString() === userId.toString());

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Compute per-member share amounts. For equal splits, the last member absorbs
 * any rounding remainder so the total matches exactly.
 */
const buildSplits = ({ splitType, amount, memberIds, customSplits }) => {
  if (splitType === 'custom') {
    if (!Array.isArray(customSplits) || customSplits.length === 0) {
      throw new ExpenseError('INVALID_SPLIT_AMOUNTS', 'customSplits required for custom split', 422);
    }
    const sum = customSplits.reduce((a, s) => a + Number(s.amount), 0);
    if (Math.abs(sum - amount) > TOLERANCE) {
      throw new ExpenseError(
        'INVALID_SPLIT_AMOUNTS',
        `Custom splits sum (${round2(sum)}) does not equal amount (${amount})`,
        422
      );
    }
    return customSplits.map((s) => ({ user: s.userId, shareAmount: round2(Number(s.amount)) }));
  }

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new ExpenseError('INVALID_SPLIT_AMOUNTS', 'memberIds required for equal split', 422);
  }
  const base = round2(amount / memberIds.length);
  const splits = memberIds.map((uid, idx) => ({
    user: uid,
    shareAmount: idx === memberIds.length - 1 ? round2(amount - base * (memberIds.length - 1)) : base,
  }));
  return splits;
};

const formatContent = (actorName, amount, currency, category, splitCount) =>
  `${actorName} added ${currency || ''}${amount} for ${category} — split ${splitCount} way${splitCount === 1 ? '' : 's'}`;

const broadcastToGroup = (group, event, payload) => {
  const memberIds = group.members.map((m) => m.user);
  sseManager.sendToUsers(memberIds, event, payload);
};

export const createExpense = async (groupId, userId, body) => {
  const {
    amount,
    category,
    note = '',
    imageUrl = null,
    splitType = 'equal',
    memberIds = [],
    paidBy,
    customSplits,
  } = body;

  if (!amount || Number(amount) <= 0) {
    throw new ExpenseError('INVALID_SPLIT_AMOUNTS', 'amount must be greater than 0', 422);
  }
  if (!category || typeof category !== 'string') {
    throw new ExpenseError('INVALID_CATEGORY', 'category is required', 422);
  }

  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);
  if (!isGroupMember(group, userId)) {
    throw new ExpenseError('MEMBER_NOT_IN_GROUP', 'You are not a member of this group', 403);
  }

  const cycle = await requireActiveCycle(groupId);

  const payerId = paidBy || userId;
  if (!isGroupMember(group, payerId)) {
    throw new ExpenseError('MEMBER_NOT_IN_GROUP', 'paidBy is not a member of the group', 422);
  }

  const participantIds = splitType === 'custom' ? customSplits.map((s) => s.userId) : memberIds;
  for (const uid of participantIds) {
    if (!isGroupMember(group, uid)) {
      throw new ExpenseError('MEMBER_NOT_IN_GROUP', `User ${uid} is not a member of the group`, 422);
    }
  }

  const splitRows = buildSplits({
    splitType,
    amount: Number(amount),
    memberIds,
    customSplits,
  });

  const sender = await User.findById(userId);
  const actorName = sender ? sender.fName : 'Someone';
  const now = new Date();

  const session = await mongoose.startSession();
  let createdMessage;
  let createdExpense;
  let createdSplits;
  try {
    await session.withTransaction(async () => {
      const [expense] = await Expense.create(
        [
          {
            cycle: cycle._id,
            group: groupId,
            message: new mongoose.Types.ObjectId(), // placeholder, replaced below
            paidBy: payerId,
            amount: round2(Number(amount)),
            category,
            note,
            imageUrl,
            splitType,
            createdBy: userId,
            editableUntil: new Date(now.getTime() + EDIT_WINDOW_MS),
          },
        ],
        { session }
      );

      const content = formatContent(actorName, round2(Number(amount)), cycle.currency, category, splitRows.length);
      const [message] = await Message.create(
        [
          {
            group: groupId,
            sender: userId,
            content,
            type: 'spend',
            metadata: {
              expenseId: expense._id,
              amount: round2(Number(amount)),
              category,
              paidBy: payerId,
              splitCount: splitRows.length,
              splitType,
              currency: cycle.currency,
            },
          },
        ],
        { session }
      );

      expense.message = message._id;
      await expense.save({ session });

      const splitDocs = await ExpenseSplit.create(
        splitRows.map((s) => ({
          expense: expense._id,
          cycle: cycle._id,
          group: groupId,
          user: s.user,
          shareAmount: s.shareAmount,
          status: 'pending',
        })),
        { session, ordered: true }
      );

      createdExpense = expense;
      createdMessage = message;
      createdSplits = splitDocs;
    });
  } finally {
    session.endSession();
  }

  group.lastActivity = new Date();
  await group.save();

  await broadcastNewMessage(group, createdMessage);
  broadcastToGroup(group, 'expense.new', {
    expense: createdExpense.toJSON(),
    splits: (createdSplits || []).map((s) => (s.toJSON ? s.toJSON() : s)),
    message: createdMessage.toJSON(),
    cycleId: cycle._id,
    groupId,
  });

  return { expense: createdExpense, message: createdMessage };
};

const assertCreatorAndWindow = (expense, userId) => {
  if (expense.isDeleted) throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  if (expense.createdBy.toString() !== userId.toString()) {
    throw new ExpenseError('NOT_EXPENSE_CREATOR', 'Only the expense creator can modify this', 403);
  }
  if (new Date() >= expense.editableUntil) {
    throw new ExpenseError('EDIT_WINDOW_EXPIRED', 'Edit/delete window has expired', 403);
  }
};

export const getExpense = async (expenseId) => {
  const expense = await Expense.findById(expenseId).populate('paidBy', 'fName lName');
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  const splits = await ExpenseSplit.find({ expense: expense._id }).populate('user', 'fName lName');
  return { expense, splits };
};

export const updateExpense = async (groupId, expenseId, userId, body) => {
  const expense = await Expense.findById(expenseId);
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense does not belong to this group', 404);
  }
  assertCreatorAndWindow(expense, userId);

  const group = await Group.findById(groupId);
  const cycle = await ExpenseCycle.findById(expense.cycle);

  const next = {
    amount: body.amount !== undefined ? Number(body.amount) : expense.amount,
    category: body.category ?? expense.category,
    note: body.note ?? expense.note,
    imageUrl: body.imageUrl !== undefined ? body.imageUrl : expense.imageUrl,
    splitType: body.splitType ?? expense.splitType,
    paidBy: body.paidBy ?? expense.paidBy,
  };

  if (next.amount <= 0) {
    throw new ExpenseError('INVALID_SPLIT_AMOUNTS', 'amount must be greater than 0', 422);
  }
  if (!isGroupMember(group, next.paidBy)) {
    throw new ExpenseError('MEMBER_NOT_IN_GROUP', 'paidBy is not a member of the group', 422);
  }

  // Rebuild splits if split-affecting fields changed or split arrays provided
  const splitChanged =
    body.splitType !== undefined ||
    body.memberIds !== undefined ||
    body.customSplits !== undefined ||
    body.amount !== undefined;

  let newSplitRows = null;
  if (splitChanged) {
    const participantIds =
      next.splitType === 'custom'
        ? (body.customSplits || []).map((s) => s.userId)
        : body.memberIds || [];
    for (const uid of participantIds) {
      if (!isGroupMember(group, uid)) {
        throw new ExpenseError('MEMBER_NOT_IN_GROUP', `User ${uid} is not a member of the group`, 422);
      }
    }
    newSplitRows = buildSplits({
      splitType: next.splitType,
      amount: next.amount,
      memberIds: body.memberIds,
      customSplits: body.customSplits,
    });
  }

  const sender = await User.findById(expense.createdBy);
  const actorName = sender ? sender.fName : 'Someone';

  const session = await mongoose.startSession();
  let updatedMessage;
  try {
    await session.withTransaction(async () => {
      expense.amount = round2(next.amount);
      expense.category = next.category;
      expense.note = next.note;
      expense.imageUrl = next.imageUrl;
      expense.splitType = next.splitType;
      expense.paidBy = next.paidBy;
      await expense.save({ session });

      if (newSplitRows) {
        await ExpenseSplit.deleteMany({ expense: expense._id }, { session });
        await ExpenseSplit.create(
          newSplitRows.map((s) => ({
            expense: expense._id,
            cycle: expense.cycle,
            group: expense.group,
            user: s.user,
            shareAmount: s.shareAmount,
            status: 'pending',
          })),
          { session, ordered: true }
        );
      }

      const splitCount = newSplitRows
        ? newSplitRows.length
        : await ExpenseSplit.countDocuments({ expense: expense._id }).session(session);

      const content = formatContent(actorName, expense.amount, cycle.currency, expense.category, splitCount);
      const message = await Message.findById(expense.message).session(session);
      if (message) {
        message.content = content;
        message.metadata = {
          ...(message.metadata || {}),
          expenseId: expense._id,
          amount: expense.amount,
          category: expense.category,
          paidBy: expense.paidBy,
          splitCount,
          splitType: expense.splitType,
          currency: cycle.currency,
        };
        message.markModified('metadata');
        await message.save({ session });
        updatedMessage = message;
      }
    });
  } finally {
    session.endSession();
  }

  if (updatedMessage) {
    broadcastToGroup(group, 'message.updated', {
      messageId: updatedMessage._id,
      metadata: updatedMessage.metadata,
      content: updatedMessage.content,
    });
    broadcastToGroup(group, 'expense.updated', {
      expense: expense.toJSON(),
      message: updatedMessage.toJSON(),
      groupId,
    });
  }

  return { expense, message: updatedMessage };
};

export const deleteExpense = async (groupId, expenseId, userId) => {
  const expense = await Expense.findById(expenseId);
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense does not belong to this group', 404);
  }
  assertCreatorAndWindow(expense, userId);

  const group = await Group.findById(groupId);

  const session = await mongoose.startSession();
  let messageId;
  try {
    await session.withTransaction(async () => {
      expense.isDeleted = true;
      await expense.save({ session });
      await ExpenseSplit.deleteMany({ expense: expense._id }, { session });
      const message = await Message.findById(expense.message).session(session);
      if (message) {
        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save({ session });
        messageId = message._id;
      }
    });
  } finally {
    session.endSession();
  }

  if (messageId) {
    broadcastToGroup(group, 'message.deleted', { messageId });
    broadcastToGroup(group, 'expense.deleted', {
      expenseId: expense._id,
      messageId,
      groupId,
    });
  }

  return { expenseId };
};

export const listExpenses = async (groupId, filters) => {
  const {
    cycleId,
    category,
    paidBy,
    from,
    to,
    page = 1,
    limit = 20,
  } = filters;

  const query = { group: groupId, isDeleted: false };

  if (cycleId) {
    query.cycle = cycleId;
  } else {
    const active = await ExpenseCycle.findOne({ group: groupId, status: 'active' });
    if (active) query.cycle = active._id;
  }
  if (category) query.category = new RegExp(`^${category}$`, 'i');
  if (paidBy) query.paidBy = paidBy;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Expense.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('paidBy', 'fName lName')
      .populate('createdBy', 'fName lName'),
    Expense.countDocuments(query),
  ]);

  const expenseIds = items.map((e) => e._id);
  const allSplits = await ExpenseSplit.find({ expense: { $in: expenseIds } }).populate(
    'user',
    'fName lName'
  );
  const splitsByExpense = new Map();
  for (const s of allSplits) {
    const key = s.expense.toString();
    if (!splitsByExpense.has(key)) splitsByExpense.set(key, []);
    splitsByExpense.get(key).push(s);
  }

  const expenses = items.map((e) => ({
    ...e.toObject(),
    splits: splitsByExpense.get(e._id.toString()) || [],
  }));

  return {
    expenses,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};
