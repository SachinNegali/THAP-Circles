import mongoose from 'mongoose';
import ExpenseCycle from '../models/expenseCycle.model.js';
import ExpenseSplit from '../models/expenseSplit.model.js';
import Expense from '../models/expense.model.js';
import BalanceForward from '../models/balanceForward.model.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import * as notificationService from './notification.service.js';

export const listCycles = async (groupId) => {
  return ExpenseCycle.find({ group: groupId }).sort({ startedAt: -1 });
};

export const getActiveCycle = async (groupId) => {
  return ExpenseCycle.findOne({ group: groupId, status: 'active' });
};

export const requireActiveCycle = async (groupId) => {
  const cycle = await getActiveCycle(groupId);
  if (!cycle) {
    throw new ExpenseError('NO_ACTIVE_CYCLE', 'No active expense cycle for this group', 404);
  }
  return cycle;
};

/**
 * Compute net balances for a cycle (from splits + balance-forwards already carried in).
 * Returns Map<userId, number> — positive = owed to them, negative = they owe.
 */
export const computeNetForCycle = async (cycle) => {
  const net = new Map();
  const add = (uid, amt) => {
    const key = uid.toString();
    net.set(key, (net.get(key) || 0) + amt);
  };

  const splits = await ExpenseSplit.find({
    cycle: cycle._id,
    status: { $ne: 'settled' },
  }).populate('expense', 'paidBy isDeleted');

  for (const split of splits) {
    if (!split.expense || split.expense.isDeleted) continue;
    add(split.user, -split.shareAmount);
    add(split.expense.paidBy, split.shareAmount);
  }

  const forwards = await BalanceForward.find({ toCycle: cycle._id });
  for (const bf of forwards) {
    add(bf.fromUser, -bf.amount);
    add(bf.toUser, bf.amount);
  }

  return net;
};

/**
 * Greedy debt simplification. Input: Map<userIdString, net>.
 * Output: [{ from, to, amount }]
 */
export const simplifyDebts = (netMap) => {
  const creditors = [];
  const debtors = [];
  for (const [userId, amount] of netMap.entries()) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.009) creditors.push({ userId, amount: rounded });
    else if (rounded < -0.009) debtors.push({ userId, amount: rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => a.amount - b.amount);

  const edges = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
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

/**
 * Start a new cycle. If an active cycle exists, close it and create BalanceForward
 * docs that carry simplified net balances into the new cycle.
 */
export const createCycle = async (groupId, userId, currency) => {
  const session = await mongoose.startSession();
  try {
    let warnings = [];
    let newCycle;
    let oldCycleId = null;

    await session.withTransaction(async () => {
      const existing = await ExpenseCycle.findOne({ group: groupId, status: 'active' }).session(session);
      if (existing) oldCycleId = existing._id;

      newCycle = await ExpenseCycle.create(
        [
          {
            group: groupId,
            currency: currency || existing?.currency,
            createdBy: userId,
            startedAt: new Date(),
            status: 'active',
          },
        ],
        { session }
      );
      newCycle = newCycle[0];

      if (existing) {
        // Carry-forward simplified debts
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
              toCycle: newCycle._id,
            })),
            { session }
          );
        }

        existing.status = 'closed';
        existing.closedAt = new Date();
        existing.closeReason = 'new_cycle';
        await existing.save({ session });

        warnings = edges.map((e) => ({ fromUser: e.from, toUser: e.to, amount: e.amount }));
      }
    });

    session.endSession();

    if (oldCycleId) {
      const Group = (await import('../models/group.model.js')).default;
      const group = await Group.findById(groupId);
      if (group) {
        const memberIds = group.members.map((m) => m.user);
        await notificationService.createNotifications(
          memberIds,
          'cycle_closed',
          'New expense cycle started',
          `A new cycle has started in ${group.name || 'your chat'}`,
          {
            groupId: group._id,
            oldCycleId,
            newCycleId: newCycle._id,
            carryForwardCount: warnings.length,
          }
        );
      }
    }

    return { warnings, newCycle };
  } catch (err) {
    session.endSession();
    throw err;
  }
};
