import Nudge from '../models/nudge.model.js';
import User from '../models/user.model.js';
import * as notificationService from './notification.service.js';
import { ExpenseError } from '../utils/expenseErrors.js';
import { getBalances } from './balance.service.js';

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const sendNudge = async (groupId, fromUserId, toUserId) => {
  if (!toUserId) throw new ExpenseError('INVALID_NUDGE', 'toUserId is required', 422);

  const balances = await getBalances(groupId);
  const debt = balances.simplifiedDebts.find(
    (d) =>
      d.from?._id.toString() === toUserId.toString() &&
      d.to?._id.toString() === fromUserId.toString()
  );
  if (!debt) {
    throw new ExpenseError(
      'NOT_A_CREDITOR',
      'You are not a creditor of this user in the active cycle',
      403
    );
  }

  const now = new Date();
  const existing = await Nudge.findOne({
    group: groupId,
    fromUser: fromUserId,
    toUser: toUserId,
    nextAllowedAt: { $gt: now },
  });
  if (existing) {
    throw new ExpenseError(
      'NUDGE_RATE_LIMITED',
      'You can only nudge once every 24 hours per debtor',
      429,
      { retryAfter: existing.nextAllowedAt }
    );
  }

  const nudge = await Nudge.create({
    group: groupId,
    fromUser: fromUserId,
    toUser: toUserId,
    amount: debt.amount,
    sentAt: now,
    nextAllowedAt: new Date(now.getTime() + NUDGE_COOLDOWN_MS),
  });

  const from = await User.findById(fromUserId);
  await notificationService.createNotification(
    toUserId,
    'expense_nudge',
    'Payment reminder',
    `${from?.fName || 'Someone'} is reminding you to settle ${balances.currency || ''}${debt.amount}`,
    {
      groupId,
      fromUserId,
      amount: debt.amount,
    }
  );

  return nudge;
};
