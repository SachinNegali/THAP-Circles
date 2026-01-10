import {loginUserWithSocial, refreshAuth} from '../services/auth.service.js';
import {generateAuthTokens} from '../services/token.service.js';
import { handleError, sendBadRequest, sendUnauthorized } from '../utils/errorHandler.js';

export const socialLogin = async (req, res) => {
  try {
    const { provider, socialId, email, fName, lName } = req.body;

    if (!provider || !socialId || !email || !fName || !lName) {
      return sendBadRequest(res, 'Missing required fields: provider, socialId, email, fName, lName');
    }

    const user = await loginUserWithSocial(email, fName, lName, provider, socialId);
    const tokens = await generateAuthTokens(user);
    console.log("THESEE TOKENNNS...", tokens)
    res.status(200).send({
      user,
      tokens,
    });

  } catch (error) {
    return handleError(res, error, 'Social login failed');
  }
};

export const refreshTokens = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendBadRequest(res, 'Refresh token is required');
    }

    try {
      const tokens = await refreshAuth(refreshToken);
      res.send({ ...tokens });
    } catch (e) {
      return sendUnauthorized(res, e.message || 'Please authenticate');
    }
  } catch (error) {
    return handleError(res, error, 'Token refresh failed');
  }
};
