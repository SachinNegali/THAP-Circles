import mongoose, { ClientSession, Types } from 'mongoose';
import Settlement, { ISettlement } from '../models/settlement.model.js';
import ExpenseSplit, { IExpenseSplit, SplitStatus } from '../models/expenseSplit.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import sseManager from './sse.service.js';
import * as notificationService from './notification.service.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import { requireActiveCycle } from './expenseCycle.service.js';

type ObjectIdLike = string | Types.ObjectId;

const broadcastToGroup = (
  group: { members: Array<{ user: Types.ObjectId }> },
  event: string,
  payload: unknown
) => {
  const memberIds = group.members.map((m) => m.user);
  sseManager.sendToUsers(memberIds, event, payload);
};

/** Returns splits between a payer/payee pair in a cycle filtered by status. */
const findSplitsForPair = async (
  cycleId: Types.ObjectId,
  fromUserId: ObjectIdLike,
  toUserId: ObjectIdLike,
  statuses: SplitStatus[]
): Promise<IExpenseSplit[]> => {
  const candidates = await ExpenseSplit.find({
    cycle: cycleId,
    user: fromUserId,
    status: { $in: statuses },
  }).populate('expense', 'paidBy');

  return (candidates as unknown as IExpenseSplit[]).filter((s) => {
    const exp = s.expense as unknown as { paidBy: Types.ObjectId } | null;
    return !!exp && exp.paidBy.toString() === toUserId.toString();
  });
};

export interface InitiateSettlementInput {
  fromUserId: ObjectIdLike;
  toUserId: ObjectIdLike;
  amount: number;
}

export const initiateSettlement = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  { fromUserId, toUserId, amount }: InitiateSettlementInput
): Promise<ISettlement> => {
  if (!fromUserId || !toUserId || !amount) {
    throw new ExpenseError(
      'INVALID_SETTLEMENT',
      'fromUserId, toUserId, amount required',
      422
    );
  }

  const group = await Group.findById(groupId);
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);

  const isParty =
    userId.toString() === fromUserId.toString() ||
    userId.toString() === toUserId.toString();
  if (!isParty) {
    throw new ExpenseError(
      'NOT_SETTLEMENT_PARTY',
      'You must be part of this settlement',
      403
    );
  }

  const cycle = await requireActiveCycle(groupId);
  const cycleId = cycle._id as Types.ObjectId;

  const session: ClientSession = await mongoose.startSession();
  let settlement: ISettlement | undefined;
  try {
    await session.withTransaction(async () => {
      const created = await Settlement.create(
        [
          {
            cycle: cycleId,
            group: groupId,
            fromUser: fromUserId,
            toUser: toUserId,
            amount: Math.round(Number(amount) * 100) / 100,
            status: 'pending_confirmation' as const,
            initiatedBy: userId,
            initiatedAt: new Date(),
          },
        ],
        { session }
      );
      settlement = created[0];

      const pending = await findSplitsForPair(cycleId, fromUserId, toUserId, [
        'pending',
      ]);
      if (pending.length > 0) {
        await ExpenseSplit.updateMany(
          { _id: { $in: pending.map((s) => s._id) } },
          { $set: { status: 'settlement_initiated' } },
          { session }
        );
      }
    });
  } finally {
    session.endSession();
  }

  if (!settlement) throw new Error('Settlement creation failed');

  const otherPartyId =
    userId.toString() === fromUserId.toString() ? toUserId : fromUserId;
  const initiator = await User.findById(userId);
  await notificationService.createNotification(
    otherPartyId,
    'settlement_initiated',
    'Settlement requested',
    `${initiator?.fName ?? 'Someone'} initiated a settlement of ${settlement.amount}`,
    {
      groupId,
      settlementId: settlement._id,
      amount: settlement.amount,
      initiatedBy: userId,
    }
  );

  broadcastToGroup(group, 'settlement_updated', {
    settlementId: settlement._id,
    status: settlement.status,
  });

  return settlement;
};

export const confirmSettlement = async (
  groupId: ObjectIdLike,
  settlementId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<ISettlement> => {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || settlement.group.toString() !== groupId.toString()) {
    throw new ExpenseError('SETTLEMENT_NOT_FOUND', 'Settlement not found', 404);
  }
  if (settlement.status !== 'pending_confirmation') {
    throw new ExpenseError(
      'SETTLEMENT_NOT_PENDING',
      'Settlement is not pending confirmation',
      409
    );
  }
  if (settlement.initiatedBy.toString() === userId.toString()) {
    throw new ExpenseError(
      'CANNOT_CONFIRM_OWN_SETTLEMENT',
      'The initiator cannot confirm their own settlement',
      403
    );
  }
  const isParty =
    userId.toString() === settlement.fromUser.toString() ||
    userId.toString() === settlement.toUser.toString();
  if (!isParty) {
    throw new ExpenseError(
      'NOT_SETTLEMENT_PARTY',
      'Only the other party can confirm',
      403
    );
  }

  const group = await Group.findById(groupId);
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);

  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      settlement.status = 'confirmed';
      settlement.confirmedAt = new Date();
      await settlement.save({ session });

      const toSettle = await findSplitsForPair(
        settlement.cycle,
        settlement.fromUser,
        settlement.toUser,
        ['settlement_initiated']
      );
      if (toSettle.length > 0) {
        await ExpenseSplit.updateMany(
          { _id: { $in: toSettle.map((s) => s._id) } },
          { $set: { status: 'settled' } },
          { session }
        );
      }
    });
  } finally {
    session.endSession();
  }

  await notificationService.createNotification(
    settlement.initiatedBy,
    'settlement_confirmed',
    'Settlement confirmed',
    `Your settlement of ${settlement.amount} was confirmed`,
    { groupId, settlementId: settlement._id, amount: settlement.amount }
  );

  broadcastToGroup(group, 'settlement_updated', {
    settlementId: settlement._id,
    status: settlement.status,
  });
  broadcastToGroup(group, 'expense_settled', {
    groupId,
    fromUserId: settlement.fromUser,
    toUserId: settlement.toUser,
    amount: settlement.amount,
  });

  return settlement;
};

export const cancelSettlement = async (
  groupId: ObjectIdLike,
  settlementId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<ISettlement> => {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || settlement.group.toString() !== groupId.toString()) {
    throw new ExpenseError('SETTLEMENT_NOT_FOUND', 'Settlement not found', 404);
  }
  if (settlement.status !== 'pending_confirmation') {
    throw new ExpenseError(
      'SETTLEMENT_NOT_PENDING',
      'Settlement is not pending confirmation',
      409
    );
  }
  if (settlement.initiatedBy.toString() !== userId.toString()) {
    throw new ExpenseError(
      'ONLY_INITIATOR_CAN_CANCEL',
      'Only the initiator can cancel',
      403
    );
  }

  const group = await Group.findById(groupId);
  if (!group) throw new ExpenseError('GROUP_NOT_FOUND', 'Group not found', 404);

  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      settlement.status = 'cancelled';
      await settlement.save({ session });

      const toRevert = await findSplitsForPair(
        settlement.cycle,
        settlement.fromUser,
        settlement.toUser,
        ['settlement_initiated']
      );
      if (toRevert.length > 0) {
        await ExpenseSplit.updateMany(
          { _id: { $in: toRevert.map((s) => s._id) } },
          { $set: { status: 'pending' } },
          { session }
        );
      }
    });
  } finally {
    session.endSession();
  }

  const otherPartyId =
    userId.toString() === settlement.fromUser.toString()
      ? settlement.toUser
      : settlement.fromUser;

  await notificationService.createNotification(
    otherPartyId,
    'settlement_cancelled',
    'Settlement cancelled',
    'A pending settlement was cancelled',
    { groupId, settlementId: settlement._id }
  );

  broadcastToGroup(group, 'settlement_updated', {
    settlementId: settlement._id,
    status: settlement.status,
  });

  return settlement;
};

export const listSettlements = (
  groupId: ObjectIdLike
): Promise<ISettlement[]> =>
  Settlement.find({ group: groupId })
    .sort({ createdAt: -1 })
    .populate('fromUser', 'fName lName')
    .populate('toUser', 'fName lName')
    .populate('initiatedBy', 'fName lName');
