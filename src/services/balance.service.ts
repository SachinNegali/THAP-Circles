import { Types } from 'mongoose';
import Expense from '../models/expense.model.js';
import ExpenseSplit from '../models/expenseSplit.model.js';
import User, { IUser } from '../models/user.model.js';
import BalanceForward from '../models/balanceForward.model.js';
import {
  computeNetForCycle,
  simplifyDebts,
  requireActiveCycle,
} from './expenseCycle.service.js';

type ObjectIdLike = string | Types.ObjectId;

interface HydratedUser {
  _id: Types.ObjectId;
  name: string;
}

const hydrateUser = (user: IUser | undefined): HydratedUser | null =>
  user
    ? {
        _id: user._id as Types.ObjectId,
        name: `${user.fName ?? ''} ${user.lName ?? ''}`.trim(),
      }
    : null;

const collectUsers = async (
  ids: Array<string | Types.ObjectId>
): Promise<Map<string, IUser>> => {
  const unique = [...new Set(ids.map((id) => id.toString()))];
  const users = await User.find({ _id: { $in: unique } }).select(
    'fName lName'
  );
  return new Map(
    users.map((u) => [(u._id as Types.ObjectId).toString(), u])
  );
};

export const getBalances = async (
  groupId: ObjectIdLike
): Promise<{
  cycleId: Types.ObjectId;
  currency: string;
  carryForwardIncluded: boolean;
  simplifiedDebts: Array<{
    from: HydratedUser | null;
    to: HydratedUser | null;
    amount: number;
  }>;
}> => {
  const cycle = await requireActiveCycle(groupId);
  const net = await computeNetForCycle(cycle);
  const edges = simplifyDebts(net);

  const userIds: string[] = [];
  for (const e of edges) {
    userIds.push(e.from, e.to);
  }
  const userMap = await collectUsers(userIds);

  const hasCarryForward =
    (await BalanceForward.countDocuments({ toCycle: cycle._id })) > 0;

  return {
    cycleId: cycle._id as Types.ObjectId,
    currency: cycle.currency,
    carryForwardIncluded: hasCarryForward,
    simplifiedDebts: edges.map((e) => ({
      from: hydrateUser(userMap.get(e.from)),
      to: hydrateUser(userMap.get(e.to)),
      amount: e.amount,
    })),
  };
};

export const getSummary = async (
  groupId: ObjectIdLike
): Promise<{
  cycleId: Types.ObjectId;
  currency: string;
  totalSpend: number;
  byCategory: Array<{ category: string; total: number }>;
  byMember: Array<{
    user: HydratedUser | null;
    totalPaid: number;
    totalOwed: number;
  }>;
}> => {
  const cycle = await requireActiveCycle(groupId);
  const expenses = await Expense.find({ cycle: cycle._id, isDeleted: false });
  const splits = await ExpenseSplit.find({ cycle: cycle._id });

  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  const paidMap = new Map<string, number>();
  for (const e of expenses) {
    const key = e.paidBy.toString();
    paidMap.set(key, (paidMap.get(key) ?? 0) + e.amount);
  }
  const owedMap = new Map<string, number>();
  for (const s of splits) {
    const key = s.user.toString();
    owedMap.set(key, (owedMap.get(key) ?? 0) + s.shareAmount);
  }

  const memberIds = new Set<string>([...paidMap.keys(), ...owedMap.keys()]);
  const userMap = await collectUsers([...memberIds]);
  const byMember = [...memberIds].map((uid) => ({
    user: hydrateUser(userMap.get(uid)),
    totalPaid: Math.round((paidMap.get(uid) ?? 0) * 100) / 100,
    totalOwed: Math.round((owedMap.get(uid) ?? 0) * 100) / 100,
  }));

  return {
    cycleId: cycle._id as Types.ObjectId,
    currency: cycle.currency,
    totalSpend: Math.round(totalSpend * 100) / 100,
    byCategory,
    byMember,
  };
};
