import express from 'express';
import * as expenseController from '../../controllers/expense.controller.js';
import auth from '../../middlewares/auth.js';
import { verifyGroupMembership } from '../../middlewares/groupAuth.js';

const router = express.Router();

router.use(auth);

// groupAuth middleware expects the group id in req.params.id OR req.params.groupId — it already handles groupId.
const requireMember = verifyGroupMembership;

// Cycles
router.get('/:groupId/cycles', requireMember, expenseController.listCycles);
router.get('/:groupId/cycles/active', requireMember, expenseController.getActiveCycle);
router.post('/:groupId/cycles', requireMember, expenseController.createCycle);

// Expenses
router.post('/:groupId/expenses', requireMember, expenseController.createExpense);
router.get('/:groupId/expenses', requireMember, expenseController.listExpenses);
router.get('/:groupId/expenses/:expenseId', requireMember, expenseController.getExpense);
router.patch('/:groupId/expenses/:expenseId', requireMember, expenseController.updateExpense);
router.delete('/:groupId/expenses/:expenseId', requireMember, expenseController.deleteExpense);

// Expense comments
router.post(
  '/:groupId/expenses/:expenseId/comments',
  requireMember,
  expenseController.addComment
);
router.get(
  '/:groupId/expenses/:expenseId/comments',
  requireMember,
  expenseController.listComments
);

// Balances & summary
router.get('/:groupId/balances', requireMember, expenseController.getBalances);
router.get('/:groupId/summary', requireMember, expenseController.getSummary);

// Settlements
router.post('/:groupId/settlements', requireMember, expenseController.initiateSettlement);
router.post(
  '/:groupId/settlements/:settlementId/confirm',
  requireMember,
  expenseController.confirmSettlement
);
router.post(
  '/:groupId/settlements/:settlementId/cancel',
  requireMember,
  expenseController.cancelSettlement
);
router.get('/:groupId/settlements', requireMember, expenseController.listSettlements);

// Nudge
router.post('/:groupId/nudge', requireMember, expenseController.sendNudge);

export default router;
