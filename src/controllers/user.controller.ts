import { Request, Response } from 'express';

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
    fName: user.fName,
    lName: user.lName,
    email: user.email,
    socialAccounts: user.socialAccounts || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
  });
};
