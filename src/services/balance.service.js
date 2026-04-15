import Expense from '../models/expense.model.js';
import ExpenseSplit from '../models/expenseSplit.model.js';
import User from '../models/user.model.js';
import BalanceForward from '../models/balanceForward.model.js';
import {
  computeNetForCycle,
  simplifyDebts,
  requireActiveCycle,
} from './expenseCycle.service.js';

const hydrateUser = (user) =>
  user ? { _id: user._id, name: `${user.fName || ''} ${user.lName || ''}`.trim() } : null;

const collectUsers = async (ids) => {
  const unique = [...new Set(ids.map((id) => id.toString()))];
  const users = await User.find({ _id: { $in: unique } }).select('fName lName');
  const map = new Map(users.map((u) => [u._id.toString(), u]));
  return map;
};

export const getBalances = async (groupId) => {
  const cycle = await requireActiveCycle(groupId);
  const net = await computeNetForCycle(cycle);
  const edges = simplifyDebts(net);

  const userIds = [];
  for (const e of edges) {
    userIds.push(e.from, e.to);
  }
  const userMap = await collectUsers(userIds);

  const hasCarryForward = (await BalanceForward.countDocuments({ toCycle: cycle._id })) > 0;

  return {
    cycleId: cycle._id,
    currency: cycle.currency,
    carryForwardIncluded: hasCarryForward,
    simplifiedDebts: edges.map((e) => ({
      from: hydrateUser(userMap.get(e.from.toString())),
      to: hydrateUser(userMap.get(e.to.toString())),
      amount: e.amount,
    })),
  };
};

export const getSummary = async (groupId) => {
  const cycle = await requireActiveCycle(groupId);

  const expenses = await Expense.find({ cycle: cycle._id, isDeleted: false });
  const splits = await ExpenseSplit.find({ cycle: cycle._id });

  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategoryMap = new Map();
  for (const e of expenses) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) || 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  // Per-member paid + owed
  const paidMap = new Map();
  for (const e of expenses) {
    const key = e.paidBy.toString();
    paidMap.set(key, (paidMap.get(key) || 0) + e.amount);
  }
  const owedMap = new Map();
  for (const s of splits) {
    const key = s.user.toString();
    owedMap.set(key, (owedMap.get(key) || 0) + s.shareAmount);
  }

  const memberIds = new Set([...paidMap.keys(), ...owedMap.keys()]);
  const userMap = await collectUsers([...memberIds]);
  const byMember = [...memberIds].map((uid) => ({
    user: hydrateUser(userMap.get(uid)),
    totalPaid: Math.round((paidMap.get(uid) || 0) * 100) / 100,
    totalOwed: Math.round((owedMap.get(uid) || 0) * 100) / 100,
  }));

  return {
    cycleId: cycle._id,
    currency: cycle.currency,
    totalSpend: Math.round(totalSpend * 100) / 100,
    byCategory,
    byMember,
  };
};
