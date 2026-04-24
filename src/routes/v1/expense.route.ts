import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { verifyGroupMembership } from '../../middlewares/groupAuth.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createCycleSchema,
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  addCommentSchema,
  initiateSettlementSchema,
  sendNudgeSchema,
  groupIdParamsSchema,
  groupExpenseIdParamsSchema,
  groupSettlementIdParamsSchema,
} from '../../validations/expense.validation.js';
import {
  listCycles,
  getActiveCycle,
  createCycle,
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  addComment,
  listComments,
  getBalances,
  getSummary,
  initiateSettlement,
  confirmSettlement,
  cancelSettlement,
  listSettlements,
  sendNudge,
} from '../../controllers/expense.controller.js';

const router = Router();

router.use(authMiddleware);

// Cycles
router.get(
  '/:groupId/cycles',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  listCycles
);
router.get(
  '/:groupId/cycles/active',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  getActiveCycle
);
router.post(
  '/:groupId/cycles',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(createCycleSchema),
  createCycle
);

// Expenses
router.post(
  '/:groupId/expenses',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(createExpenseSchema),
  createExpense
);
router.get(
  '/:groupId/expenses',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(listExpensesQuerySchema, 'query'),
  listExpenses
);
router.get(
  '/:groupId/expenses/:expenseId',
  validate(groupExpenseIdParamsSchema, 'params'),
  verifyGroupMembership,
  getExpense
);
router.patch(
  '/:groupId/expenses/:expenseId',
  validate(groupExpenseIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(updateExpenseSchema),
  updateExpense
);
router.delete(
  '/:groupId/expenses/:expenseId',
  validate(groupExpenseIdParamsSchema, 'params'),
  verifyGroupMembership,
  deleteExpense
);

// Expense comments
router.post(
  '/:groupId/expenses/:expenseId/comments',
  validate(groupExpenseIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(addCommentSchema),
  addComment
);
router.get(
  '/:groupId/expenses/:expenseId/comments',
  validate(groupExpenseIdParamsSchema, 'params'),
  verifyGroupMembership,
  listComments
);

// Balances & summary
router.get(
  '/:groupId/balances',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  getBalances
);
router.get(
  '/:groupId/summary',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  getSummary
);

// Settlements
router.post(
  '/:groupId/settlements',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(initiateSettlementSchema),
  initiateSettlement
);
router.post(
  '/:groupId/settlements/:settlementId/confirm',
  validate(groupSettlementIdParamsSchema, 'params'),
  verifyGroupMembership,
  confirmSettlement
);
router.post(
  '/:groupId/settlements/:settlementId/cancel',
  validate(groupSettlementIdParamsSchema, 'params'),
  verifyGroupMembership,
  cancelSettlement
);
router.get(
  '/:groupId/settlements',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  listSettlements
);

// Nudge
router.post(
  '/:groupId/nudge',
  validate(groupIdParamsSchema, 'params'),
  verifyGroupMembership,
  validate(sendNudgeSchema),
  sendNudge
);

export default router;
