import * as cycleService from '../services/expenseCycle.service.js';
import * as expenseService from '../services/expense.service.js';
import * as balanceService from '../services/balance.service.js';
import * as settlementService from '../services/settlement.service.js';
import * as nudgeService from '../services/nudge.service.js';
import * as commentService from '../services/expenseComment.service.js';
import { handleExpenseError } from '../utils/expenseErrors.js';

// Cycles
export const listCycles = async (req, res) => {
  try {
    const cycles = await cycleService.listCycles(req.params.groupId);
    res.send({ cycles });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to list cycles');
  }
};

export const getActiveCycle = async (req, res) => {
  try {
    const cycle = await cycleService.getActiveCycle(req.params.groupId);
    if (!cycle) return res.status(404).send({ message: 'No active cycle', error: 'NO_ACTIVE_CYCLE' });
    res.send({ cycle });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to fetch active cycle');
  }
};

export const createCycle = async (req, res) => {
  try {
    const { currency } = req.body;
    const result = await cycleService.createCycle(req.params.groupId, req.user._id, currency);
    res.status(201).send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to start new cycle');
  }
};

// Expenses
export const createExpense = async (req, res) => {
  try {
    const result = await expenseService.createExpense(
      req.params.groupId,
      req.user._id,
      req.body
    );
    res.status(201).send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to create expense');
  }
};

export const listExpenses = async (req, res) => {
  try {
    const result = await expenseService.listExpenses(req.params.groupId, req.query);
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to list expenses');
  }
};

export const getExpense = async (req, res) => {
  try {
    const result = await expenseService.getExpense(req.params.expenseId);
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to fetch expense');
  }
};

export const updateExpense = async (req, res) => {
  try {
    const result = await expenseService.updateExpense(
      req.params.groupId,
      req.params.expenseId,
      req.user._id,
      req.body
    );
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to update expense');
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const result = await expenseService.deleteExpense(
      req.params.groupId,
      req.params.expenseId,
      req.user._id
    );
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to delete expense');
  }
};

// Balances & summary
export const getBalances = async (req, res) => {
  try {
    const result = await balanceService.getBalances(req.params.groupId);
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to compute balances');
  }
};

export const getSummary = async (req, res) => {
  try {
    const result = await balanceService.getSummary(req.params.groupId);
    res.send(result);
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to compute summary');
  }
};

// Settlements
export const initiateSettlement = async (req, res) => {
  try {
    const settlement = await settlementService.initiateSettlement(
      req.params.groupId,
      req.user._id,
      req.body
    );
    res.status(201).send({ settlement });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to initiate settlement');
  }
};

export const confirmSettlement = async (req, res) => {
  try {
    const settlement = await settlementService.confirmSettlement(
      req.params.groupId,
      req.params.settlementId,
      req.user._id
    );
    res.send({ settlement });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to confirm settlement');
  }
};

export const cancelSettlement = async (req, res) => {
  try {
    const settlement = await settlementService.cancelSettlement(
      req.params.groupId,
      req.params.settlementId,
      req.user._id
    );
    res.send({ settlement });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to cancel settlement');
  }
};

export const listSettlements = async (req, res) => {
  try {
    const settlements = await settlementService.listSettlements(req.params.groupId);
    res.send({ settlements });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to list settlements');
  }
};

// Nudges
export const sendNudge = async (req, res) => {
  try {
    const nudge = await nudgeService.sendNudge(
      req.params.groupId,
      req.user._id,
      req.body.toUserId
    );
    res.status(201).send({ nudge });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to send nudge');
  }
};

// Comments
export const addComment = async (req, res) => {
  try {
    const comment = await commentService.addComment(
      req.params.groupId,
      req.params.expenseId,
      req.user._id,
      req.body.text
    );
    res.status(201).send({ comment });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to add comment');
  }
};

export const listComments = async (req, res) => {
  try {
    const comments = await commentService.listComments(
      req.params.groupId,
      req.params.expenseId
    );
    res.send({ comments });
  } catch (error) {
    return handleExpenseError(res, error, 'Failed to list comments');
  }
};
