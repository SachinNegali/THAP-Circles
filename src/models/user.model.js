import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';

const userSchema = new mongoose.Schema(
  {
    fName: {
      type: String,
      required: true,
      trim: true,
    },
    lName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    socialAccounts: [
      {
        provider: {
          type: String,
          required: true,
          enum: ['google'],
        },
        id: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Generate Access Token
 * @returns {string}
 */
userSchema.methods.generateAuthToken = function () {
  const token = jwt.sign({ sub: this._id, type: 'access' }, config.jwt.secret, {
    expiresIn: `${config.jwt.accessExpirationMinutes}m`,
  });
  return token;
};

/**
 * Generate Refresh Token
 * @returns {string}
 */
userSchema.methods.generateRefreshToken = function () {
  const token = jwt.sign({ sub: this._id, type: 'refresh' }, config.jwt.secret, {
    expiresIn: `${config.jwt.refreshExpirationDays}d`,
  });
  return token;
};

const User = mongoose.model('User', userSchema);
export default User;
