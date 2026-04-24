import mongoose, { ClientSession, Types } from 'mongoose';
import Expense, { IExpense, SplitType } from '../models/expense.model.js';
import ExpenseSplit, { IExpenseSplit } from '../models/expenseSplit.model.js';
import ExpenseCycle from '../models/expenseCycle.model.js';
import Message, { MessageDocument } from '../models/message.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import sseManager from './sse.service.js';
import { broadcastNewMessage } from './message.service.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import { requireActiveCycle } from './expenseCycle.service.js';

type ObjectIdLike = string | Types.ObjectId;

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const TOLERANCE = 0.01;

interface GroupShape {
  members: Array<{ user: Types.ObjectId }>;
}

const isGroupMember = (group: GroupShape, userId: ObjectIdLike): boolean =>
  group.members.some((m) => m.user.toString() === userId.toString());

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface CustomSplit {
  userId: ObjectIdLike;
  amount: number | string;
}

interface SplitBuildInput {
  splitType: SplitType;
  amount: number;
  memberIds?: ObjectIdLike[];
  customSplits?: CustomSplit[];
}

interface SplitRow {
  user: ObjectIdLike;
  shareAmount: number;
}

/** Resolves per-user shares, absorbing rounding remainder on the last row. */
const buildSplits = ({
  splitType,
  amount,
  memberIds,
  customSplits,
}: SplitBuildInput): SplitRow[] => {
  if (splitType === 'custom') {
    if (!Array.isArray(customSplits) || customSplits.length === 0) {
      throw new ExpenseError(
        'INVALID_SPLIT_AMOUNTS',
        'customSplits required for custom split',
        422
      );
    }
    const sum = customSplits.reduce((a, s) => a + Number(s.amount), 0);
    if (Math.abs(sum - amount) > TOLERANCE) {
      throw new ExpenseError(
        'INVALID_SPLIT_AMOUNTS',
        `Custom splits sum (${round2(sum)}) does not equal amount (${amount})`,
        422
      );
    }
    return customSplits.map((s) => ({
      user: s.userId,
      shareAmount: round2(Number(s.amount)),
    }));
  }

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new ExpenseError(
      'INVALID_SPLIT_AMOUNTS',
      'memberIds required for equal split',
      422
    );
  }
  const base = round2(amount / memberIds.length);
  return memberIds.map((uid, idx) => ({
    user: uid,
    shareAmount:
      idx === memberIds.length - 1
        ? round2(amount - base * (memberIds.length - 1))
        : base,
  }));
};

const formatContent = (
  actorName: string,
  amount: number,
  currency: string,
  category: string,
  splitCount: number
) =>
  `${actorName} added ${currency || ''}${amount} for ${category} — split ${splitCount} way${
    splitCount === 1 ? '' : 's'
  }`;

const broadcastToGroup = (group: GroupShape, event: string, payload: unknown) => {
  const memberIds = group.members.map((m) => m.user);
  sseManager.sendToUsers(memberIds, event, payload);
};

export interface CreateExpenseInput {
  amount: number | string;
  category: string;
  note?: string;
  imageUrl?: string | null;
  splitType?: SplitType;
  memberIds?: ObjectIdLike[];
  paidBy?: ObjectIdLike;
  customSplits?: CustomSplit[];
}

export const createExpense = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  body: CreateExpenseInput
): Promise<{ expense: IExpense; message: MessageDocument }> => {
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

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw new ExpenseError(
      'INVALID_SPLIT_AMOUNTS',
      'amount must be greater than 0',
      422
    );
  }
  if (!category || typeof category !== 'string') {
    throw new ExpenseError('INVALID_CATEGORY', 'category is required', 422);
  }

  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);
  if (!isGroupMember(group, userId)) {
    throw new ExpenseError(
      'MEMBER_NOT_IN_GROUP',
      'You are not a member of this group',
      403
    );
  }

  const cycle = await requireActiveCycle(groupId);
  const payerId = paidBy ?? userId;
  if (!isGroupMember(group, payerId)) {
    throw new ExpenseError(
      'MEMBER_NOT_IN_GROUP',
      'paidBy is not a member of the group',
      422
    );
  }

  const participantIds =
    splitType === 'custom'
      ? (customSplits ?? []).map((s) => s.userId)
      : memberIds;
  for (const uid of participantIds) {
    if (!isGroupMember(group, uid)) {
      throw new ExpenseError(
        'MEMBER_NOT_IN_GROUP',
        `User ${uid.toString()} is not a member of the group`,
        422
      );
    }
  }

  const splitRows = buildSplits({
    splitType,
    amount: numericAmount,
    memberIds,
    customSplits,
  });

  const sender = await User.findById(userId);
  const actorName = sender?.fName ?? 'Someone';
  const now = new Date();

  const session: ClientSession = await mongoose.startSession();
  let createdMessage: MessageDocument | undefined;
  let createdExpense: IExpense | undefined;
  let createdSplits: IExpenseSplit[] | undefined;
  try {
    await session.withTransaction(async () => {
      const [expense] = await Expense.create(
        [
          {
            cycle: cycle._id,
            group: groupId,
            message: new mongoose.Types.ObjectId(), // placeholder, replaced below
            paidBy: payerId,
            amount: round2(numericAmount),
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

      const content = formatContent(
        actorName,
        round2(numericAmount),
        cycle.currency,
        category,
        splitRows.length
      );
      const messageDocs = await Message.create(
        [
          {
            group: new Types.ObjectId(groupId.toString()),
            sender: new Types.ObjectId(userId.toString()),
            content,
            type: 'spend' as const,
            metadata: {
              expenseId: expense?._id as Types.ObjectId,
              amount: round2(numericAmount),
              category,
              paidBy: new Types.ObjectId(payerId.toString()),
              splitCount: splitRows.length,
              splitType,
              currency: cycle.currency,
            },
          },
        ],
        { session }
      );
      const message = messageDocs[0];

      if (!expense || !message) throw new Error('Failed to create expense');

      expense.message = message._id as Types.ObjectId;
      await expense.save({ session });

      const splitDocs = await ExpenseSplit.create(
        splitRows.map((s) => ({
          expense: expense._id as Types.ObjectId,
          cycle: cycle._id as Types.ObjectId,
          group: new Types.ObjectId(groupId.toString()),
          user: new Types.ObjectId(s.user.toString()),
          shareAmount: s.shareAmount,
          status: 'pending' as const,
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

  if (!createdExpense || !createdMessage) {
    throw new Error('Failed to create expense');
  }

  group.lastActivity = new Date();
  await group.save();

  await broadcastNewMessage(group, createdMessage);
  broadcastToGroup(group, 'expense.new', {
    expense: createdExpense.toJSON(),
    splits: (createdSplits ?? []).map((s) => s.toJSON()),
    message: createdMessage.toJSON(),
    cycleId: cycle._id,
    groupId,
  });

  return { expense: createdExpense, message: createdMessage };
};

const assertCreatorAndWindow = (expense: IExpense, userId: ObjectIdLike): void => {
  if (expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.createdBy.toString() !== userId.toString()) {
    throw new ExpenseError(
      'NOT_EXPENSE_CREATOR',
      'Only the expense creator can modify this',
      403
    );
  }
  if (new Date() >= expense.editableUntil) {
    throw new ExpenseError(
      'EDIT_WINDOW_EXPIRED',
      'Edit/delete window has expired',
      403
    );
  }
};

export const getExpense = async (
  expenseId: ObjectIdLike
): Promise<{ expense: IExpense; splits: IExpenseSplit[] }> => {
  const expense = await Expense.findById(expenseId).populate(
    'paidBy',
    'fName lName'
  );
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  const splits = await ExpenseSplit.find({ expense: expense._id }).populate(
    'user',
    'fName lName'
  );
  return { expense, splits };
};

export interface UpdateExpenseInput {
  amount?: number | string;
  category?: string;
  note?: string;
  imageUrl?: string | null;
  splitType?: SplitType;
  memberIds?: ObjectIdLike[];
  paidBy?: ObjectIdLike;
  customSplits?: CustomSplit[];
}

export const updateExpense = async (
  groupId: ObjectIdLike,
  expenseId: ObjectIdLike,
  userId: ObjectIdLike,
  body: UpdateExpenseInput
): Promise<{ expense: IExpense; message: MessageDocument | undefined }> => {
  const expense = await Expense.findById(expenseId);
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      'Expense does not belong to this group',
      404
    );
  }
  assertCreatorAndWindow(expense, userId);

  const group = await Group.findById(groupId);
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);
  const cycle = await ExpenseCycle.findById(expense.cycle);
  if (!cycle) throw new ExpenseError('NO_ACTIVE_CYCLE', 'Cycle not found', 404);

  const next = {
    amount: body.amount !== undefined ? Number(body.amount) : expense.amount,
    category: body.category ?? expense.category,
    note: body.note ?? expense.note,
    imageUrl: body.imageUrl !== undefined ? body.imageUrl : expense.imageUrl,
    splitType: body.splitType ?? expense.splitType,
    paidBy: body.paidBy ?? expense.paidBy,
  };

  if (next.amount <= 0) {
    throw new ExpenseError(
      'INVALID_SPLIT_AMOUNTS',
      'amount must be greater than 0',
      422
    );
  }
  if (!isGroupMember(group, next.paidBy)) {
    throw new ExpenseError(
      'MEMBER_NOT_IN_GROUP',
      'paidBy is not a member of the group',
      422
    );
  }

  const splitChanged =
    body.splitType !== undefined ||
    body.memberIds !== undefined ||
    body.customSplits !== undefined ||
    body.amount !== undefined;

  let newSplitRows: SplitRow[] | null = null;
  if (splitChanged) {
    const participantIds =
      next.splitType === 'custom'
        ? (body.customSplits ?? []).map((s) => s.userId)
        : body.memberIds ?? [];
    for (const uid of participantIds) {
      if (!isGroupMember(group, uid)) {
        throw new ExpenseError(
          'MEMBER_NOT_IN_GROUP',
          `User ${uid.toString()} is not a member of the group`,
          422
        );
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
  const actorName = sender?.fName ?? 'Someone';

  const session: ClientSession = await mongoose.startSession();
  let updatedMessage: MessageDocument | undefined;
  try {
    await session.withTransaction(async () => {
      expense.amount = round2(next.amount);
      expense.category = next.category;
      expense.note = next.note;
      expense.imageUrl = next.imageUrl;
      expense.splitType = next.splitType;
      expense.paidBy = next.paidBy as Types.ObjectId;
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
            status: 'pending' as const,
          })),
          { session, ordered: true }
        );
      }

      const splitCount = newSplitRows
        ? newSplitRows.length
        : await ExpenseSplit.countDocuments({ expense: expense._id }).session(session);

      const content = formatContent(
        actorName,
        expense.amount,
        cycle.currency,
        expense.category,
        splitCount
      );
      const message = await Message.findById(expense.message).session(session);
      if (message) {
        message.content = content;
        message.metadata = {
          ...(message.metadata ?? {}),
          expenseId: expense._id as Types.ObjectId,
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

export const deleteExpense = async (
  groupId: ObjectIdLike,
  expenseId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<{ expenseId: Types.ObjectId }> => {
  const expense = await Expense.findById(expenseId);
  if (!expense || expense.isDeleted) {
    throw new ExpenseError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
  }
  if (expense.group.toString() !== groupId.toString()) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      'Expense does not belong to this group',
      404
    );
  }
  assertCreatorAndWindow(expense, userId);

  const group = await Group.findById(groupId);

  const session: ClientSession = await mongoose.startSession();
  let messageId: Types.ObjectId | undefined;
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

  if (group && messageId) {
    broadcastToGroup(group, 'message.deleted', { messageId });
    broadcastToGroup(group, 'expense.deleted', {
      expenseId: expense._id,
      messageId,
      groupId,
    });
  }

  return { expenseId: expense._id as Types.ObjectId };
};

export interface ListExpensesFilters {
  cycleId?: ObjectIdLike;
  category?: string;
  paidBy?: ObjectIdLike;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Mongo regex metacharacter escape for safe user-input matching. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listExpenses = async (
  groupId: ObjectIdLike,
  filters: ListExpensesFilters
): Promise<{
  expenses: Array<IExpense & { splits: IExpenseSplit[] }>;
  pagination: { page: number; limit: number; total: number; pages: number };
}> => {
  const {
    cycleId,
    category,
    paidBy,
    from,
    to,
    page = 1,
    limit = 20,
  } = filters;

  const query: Record<string, unknown> = { group: groupId, isDeleted: false };

  if (cycleId) {
    query['cycle'] = cycleId;
  } else {
    const active = await ExpenseCycle.findOne({ group: groupId, status: 'active' });
    if (active) query['cycle'] = active._id;
  }
  if (category) {
    query['category'] = new RegExp(`^${escapeRegex(category)}$`, 'i');
  }
  if (paidBy) query['paidBy'] = paidBy;
  if (from || to) {
    const dateQuery: { $gte?: Date; $lte?: Date } = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    query['createdAt'] = dateQuery;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Expense.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('paidBy', 'fName lName')
      .populate('createdBy', 'fName lName'),
    Expense.countDocuments(query),
  ]);

  const expenseIds = items.map((e) => e._id);
  const allSplits = await ExpenseSplit.find({
    expense: { $in: expenseIds },
  }).populate('user', 'fName lName');

  const splitsByExpense = new Map<string, IExpenseSplit[]>();
  for (const s of allSplits) {
    const key = s.expense.toString();
    if (!splitsByExpense.has(key)) splitsByExpense.set(key, []);
    splitsByExpense.get(key)!.push(s);
  }

  const expenses = items.map((e) => ({
    ...(e.toObject() as unknown as IExpense),
    splits: splitsByExpense.get((e._id as Types.ObjectId).toString()) ?? [],
  })) as unknown as Array<IExpense & { splits: IExpenseSplit[] }>;

  return {
    expenses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};
