import mongoose, { ClientSession, Types } from 'mongoose';
import ExpenseCycle, { IExpenseCycle } from '../models/expenseCycle.model.js';
import ExpenseSplit from '../models/expenseSplit.model.js';
import BalanceForward from '../models/balanceForward.model.js';
import Group from '../models/group.model.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import * as notificationService from './notification.service.js';

type ObjectIdLike = string | Types.ObjectId;

export const listCycles = (groupId: ObjectIdLike) =>
  ExpenseCycle.find({ group: groupId }).sort({ startedAt: -1 });

export const getActiveCycle = (groupId: ObjectIdLike) =>
  ExpenseCycle.findOne({ group: groupId, status: 'active' });

export const requireActiveCycle = async (
  groupId: ObjectIdLike
): Promise<IExpenseCycle> => {
  const cycle = await getActiveCycle(groupId);
  if (!cycle) {
    throw new ExpenseError(
      'NO_ACTIVE_CYCLE',
      'No active expense cycle for this group',
      404
    );
  }
  return cycle;
};

/** Net per-user balance for a cycle: positive = owed to them, negative = owes. */
export const computeNetForCycle = async (
  cycle: IExpenseCycle
): Promise<Map<string, number>> => {
  const net = new Map<string, number>();
  const add = (uid: Types.ObjectId, amt: number) => {
    const key = uid.toString();
    net.set(key, (net.get(key) ?? 0) + amt);
  };

  const splits = await ExpenseSplit.find({
    cycle: cycle._id,
    status: { $ne: 'settled' },
  }).populate<{ expense: { paidBy: Types.ObjectId; isDeleted: boolean } }>(
    'expense',
    'paidBy isDeleted'
  );

  for (const split of splits) {
    const exp = split.expense;
    if (!exp || exp.isDeleted) continue;
    add(split.user, -split.shareAmount);
    add(exp.paidBy, split.shareAmount);
  }

  const forwards = await BalanceForward.find({ toCycle: cycle._id });
  for (const bf of forwards) {
    add(bf.fromUser, -bf.amount);
    add(bf.toUser, bf.amount);
  }

  return net;
};

export interface SimplifiedEdge {
  from: string;
  to: string;
  amount: number;
}

/** Greedy debt simplification over a net-balance map. */
export const simplifyDebts = (netMap: Map<string, number>): SimplifiedEdge[] => {
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, amount] of netMap.entries()) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.009) creditors.push({ userId, amount: rounded });
    else if (rounded < -0.009) debtors.push({ userId, amount: rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => a.amount - b.amount);

  const edges: SimplifiedEdge[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]!;
    const d = debtors[di]!;
    const settled = Math.min(c.amount, -d.amount);
    edges.push({
      from: d.userId,
      to: c.userId,
      amount: Math.round(settled * 100) / 100,
    });
    c.amount = Math.round((c.amount - settled) * 100) / 100;
    d.amount = Math.round((d.amount + settled) * 100) / 100;
    if (c.amount <= 0.009) ci += 1;
    if (d.amount >= -0.009) di += 1;
  }

  return edges;
};

/** Starts a new cycle — closes any active one and carries forward simplified debts. */
export const createCycle = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  currency?: string
): Promise<{
  warnings: Array<{ fromUser: string; toUser: string; amount: number }>;
  newCycle: IExpenseCycle;
}> => {
  const session: ClientSession = await mongoose.startSession();
  try {
    let warnings: Array<{ fromUser: string; toUser: string; amount: number }> = [];
    let newCycle: IExpenseCycle | undefined;
    let oldCycleId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const existing = await ExpenseCycle.findOne({
        group: groupId,
        status: 'active',
      }).session(session);
      if (existing) oldCycleId = existing._id as Types.ObjectId;

      const created = await ExpenseCycle.create(
        [
          {
            group: groupId,
            currency: currency ?? existing?.currency,
            createdBy: userId,
            startedAt: new Date(),
            status: 'active' as const,
          },
        ],
        { session }
      );
      newCycle = created[0];

      if (existing && newCycle) {
        const net = await computeNetForCycle(existing);
        const edges = simplifyDebts(net);

        if (edges.length > 0) {
          await BalanceForward.create(
            edges.map((e) => ({
              group: groupId,
              fromUser: e.from,
              toUser: e.to,
              amount: e.amount,
              fromCycle: existing._id,
              toCycle: newCycle!._id,
            })),
            { session }
          );
        }

        existing.status = 'closed';
        existing.closedAt = new Date();
        existing.closeReason = 'new_cycle';
        await existing.save({ session });

        warnings = edges.map((e) => ({
          fromUser: e.from,
          toUser: e.to,
          amount: e.amount,
        }));
      }
    });

    if (oldCycleId && newCycle) {
      const group = await Group.findById(groupId);
      if (group) {
        const memberIds = group.members.map((m) => m.user);
        await notificationService.createNotifications(
          memberIds,
          'cycle_closed',
          'New expense cycle started',
          `A new cycle has started in ${group.name ?? 'your chat'}`,
          {
            groupId: group._id,
            oldCycleId,
            newCycleId: newCycle._id,
            carryForwardCount: warnings.length,
          }
        );
      }
    }

    if (!newCycle) throw new Error('Failed to create cycle');
    return { warnings, newCycle };
  } finally {
    session.endSession();
  }
};
