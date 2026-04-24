import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as cycleService from '../services/expenseCycle.service.js';
import * as expenseService from '../services/expense.service.js';
import * as balanceService from '../services/balance.service.js';
import * as settlementService from '../services/settlement.service.js';
import * as nudgeService from '../services/nudge.service.js';
import * as commentService from '../services/expenseComment.service.js';
import { handleExpenseError } from '../utils/expenseErrors.js';
import type {
  CreateCycleInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
  AddCommentInput,
  InitiateSettlementInput,
  SendNudgeInput,
} from '../validations/expense.validation.js';

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

// ── Cycles ─────────────────────────────────────────────────────────────────
export const listCycles = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const cycles = await cycleService.listCycles(groupId);
    res.send({ cycles });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to list cycles');
  }
};

export const getActiveCycle = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const cycle = await cycleService.getActiveCycle(groupId);
    if (!cycle) {
      res.status(404).send({ message: 'No active cycle', error: 'NO_ACTIVE_CYCLE' });
      return;
    }
    res.send({ cycle });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to fetch active cycle');
  }
};

export const createCycle = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const { currency } = req.body as CreateCycleInput;
    const result = await cycleService.createCycle(groupId, userId, currency);
    res.status(201).send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to start new cycle');
  }
};

// ── Expenses ───────────────────────────────────────────────────────────────
export const createExpense = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const result = await expenseService.createExpense(
      groupId,
      userId,
      req.body as CreateExpenseInput
    );
    res.status(201).send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to create expense');
  }
};

export const listExpenses = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const result = await expenseService.listExpenses(
      groupId,
      req.query as unknown as ListExpensesQuery
    );
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to list expenses');
  }
};

export const getExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = String(req.params['expenseId']);
    const result = await expenseService.getExpense(expenseId);
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to fetch expense');
  }
};

export const updateExpense = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const expenseId = String(req.params['expenseId']);
    const result = await expenseService.updateExpense(
      groupId,
      expenseId,
      userId,
      req.body as UpdateExpenseInput
    );
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to update expense');
  }
};

export const deleteExpense = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const expenseId = String(req.params['expenseId']);
    const result = await expenseService.deleteExpense(groupId, expenseId, userId);
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to delete expense');
  }
};

// ── Balances & summary ─────────────────────────────────────────────────────
export const getBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const result = await balanceService.getBalances(groupId);
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to compute balances');
  }
};

export const getSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const result = await balanceService.getSummary(groupId);
    res.send(result);
  } catch (error) {
    handleExpenseError(res, error, 'Failed to compute summary');
  }
};

// ── Settlements ────────────────────────────────────────────────────────────
export const initiateSettlement = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const body = req.body as InitiateSettlementInput;
    const settlement = await settlementService.initiateSettlement(
      groupId,
      userId,
      {
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount,
      }
    );
    res.status(201).send({ settlement });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to initiate settlement');
  }
};

export const confirmSettlement = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const settlementId = String(req.params['settlementId']);
    const settlement = await settlementService.confirmSettlement(
      groupId,
      settlementId,
      userId
    );
    res.send({ settlement });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to confirm settlement');
  }
};

export const cancelSettlement = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const settlementId = String(req.params['settlementId']);
    const settlement = await settlementService.cancelSettlement(
      groupId,
      settlementId,
      userId
    );
    res.send({ settlement });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to cancel settlement');
  }
};

export const listSettlements = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const settlements = await settlementService.listSettlements(groupId);
    res.send({ settlements });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to list settlements');
  }
};

// ── Nudges ─────────────────────────────────────────────────────────────────
export const sendNudge = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const { toUserId } = req.body as SendNudgeInput;
    const nudge = await nudgeService.sendNudge(groupId, userId, toUserId);
    res.status(201).send({ nudge });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to send nudge');
  }
};

// ── Comments ───────────────────────────────────────────────────────────────
export const addComment = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const groupId = String(req.params['groupId']);
    const expenseId = String(req.params['expenseId']);
    const { text } = req.body as AddCommentInput;
    const comment = await commentService.addComment(groupId, expenseId, userId, text);
    res.status(201).send({ comment });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to add comment');
  }
};

export const listComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = String(req.params['groupId']);
    const expenseId = String(req.params['expenseId']);
    const comments = await commentService.listComments(groupId, expenseId);
    res.send({ comments });
  } catch (error) {
    handleExpenseError(res, error, 'Failed to list comments');
  }
};
