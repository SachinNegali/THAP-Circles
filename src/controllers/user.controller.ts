import { Request, Response } from 'express';
import User from '../models/user.model.js';

/** Escape Mongo regex metacharacters before feeding user input to $regex. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /user/me
 *
 * Returns the authenticated user's details.
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;

  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  res.status(200).json({
    _id: user._id,
    userId: user.userId ?? null,
    fName: user.fName,
    lName: user.lName,
    email: user.email,
    socialAccounts: user.socialAccounts || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
  });
};

/**
 * PATCH /user/me
 *
 * Lets the authenticated user update their profile (fName, lName, userId).
 * userId must be unique — returns 409 if already taken.
 */
export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;

  if (!user) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  const { fName, lName, userId } = req.body as {
    fName?: string;
    lName?: string;
    userId?: string;
  };

  // Check uniqueness before writing
  if (userId !== undefined) {
    const taken = await (User as any).isUserIdTaken(userId, user._id);
    if (taken) {
      res.status(409).json({ message: 'Username is already taken' });
      return;
    }
  }

  if (fName !== undefined) user.fName = fName;
  if (lName !== undefined) user.lName = lName;
  if (userId !== undefined) user.userId = userId;

  await user.save();

  res.status(200).json({
    _id: user._id,
    userId: user.userId ?? null,
    fName: user.fName,
    lName: user.lName,
    email: user.email,
    socialAccounts: user.socialAccounts || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
  });
};

/**
 * GET /user/search
 *
 * Search for users by fName, lName, or userId.
 * Supports fuzzy search and pagination.
 */
export const searchUsers = async (req: Request, res: Response): Promise<void> => {
  const { q, page, limit } = req.query as unknown as {
    q: string;
    page: number;
    limit: number;
  };

  const skip = (page - 1) * limit;

  // Fuzzy search query: matches q in fName, lName, or userId.
  // Metacharacters are escaped to prevent ReDoS and injection via $regex.
  const safeQ = q ? escapeRegex(q) : '';
  const query = safeQ
    ? {
        $or: [
          { fName: { $regex: safeQ, $options: 'i' } },
          { lName: { $regex: safeQ, $options: 'i' } },
          { userId: { $regex: safeQ, $options: 'i' } },
        ],
      }
    : {};

  /**
   * Fetch users matching the query with projection and pagination.
   * We return only the fields requested by the user.
   */
  const users = await User.find(query)
    .select('fName lName userId picture')
    .skip(skip)
    .limit(limit)
    .lean();

  const totalResults = await User.countDocuments(query);  
  res.status(200).json({
    users: users.map((u: any) => ({
      id: u._id,
      name: `${u.fName} ${u.lName}`.trim(),
      userId: u.userId || null,
      picture: u.picture || '',
    })),
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit),
    totalResults,
  });
};
