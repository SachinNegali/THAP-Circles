import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/user.model.js';

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error();
    }

    const token = authHeader.replace('Bearer ', '');
    
    /**
     * SECURITY MIGRATION: 
     * We try verifying with the new accessSecret first. 
     * Falling back to the old secret allows currently active sessions 
     * to remain valid during deployment.
     */
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret);
    } catch (err) {
      decoded = jwt.verify(token, config.jwt.secret);
    }

    // Check if it's an access token
    if (decoded.type !== 'access') {
      throw new Error();
    }

    // Support both new 'userId' and old 'sub' payload keys
    const userId = decoded.userId || decoded.sub;
    const user = await User.findById(userId);

    if (!user) {
      throw new Error();
    }

    /**
     * SECURITY: tokenVersion check.
     * If the user logged out, their tokenVersion was incremented.
     * Any token with an older version is immediately rejected.
     */
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      throw new Error('Token version mismatch');
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

export default auth;
