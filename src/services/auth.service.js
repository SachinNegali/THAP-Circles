import User from '../models/user.model.js';
import {generateAuthTokens, verifyToken} from './token.service.js';

/**
 * Login with social provider
 * @param {string} email
 * @param {string} fName
 * @param {string} lName
 * @param {string} provider
 * @param {string} socialId
 * @returns {Promise<User>}
 */
export const loginUserWithSocial = async (email, fName, lName, provider, socialId) => {
  let user = await User.findOne({ email });

  if (user) {
    const alreadyLinked = user.socialAccounts.find(
      (acc) => acc.provider === provider && acc.id === socialId
    );

    if (!alreadyLinked) {
      user.socialAccounts.push({ provider, id: socialId });
      await user.save();
    }
  } else {
    // Create new user with fName and lName
    user = await User.create({
      fName,
      lName: lName || '',
      email,
      socialAccounts: [{ provider, id: socialId }],
    });
  }
  return user;
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
export const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await verifyToken(refreshToken, 'refresh');
    const user = await User.findById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.deleteOne();
    return generateAuthTokens(user);
  } catch (error) {
    throw new Error('Please authenticate');
  }
};