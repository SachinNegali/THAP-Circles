/**
 * User Model — OAuth-Only, Passwordless
 * =======================================
 *
 * SECURITY DECISIONS:
 * - googleId (payload.sub) is the canonical unique identifier, NOT email.
 * - refreshTokenHash stores a SHA-256 hash, NEVER the raw token.
 * - tokenVersion is incremented on logout to immediately invalidate
 *   ALL existing access tokens without maintaining a denylist.
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISocialAccount {
  provider: string;
  id: string;
}

export interface IUser extends Document {
  fName: string;
  lName: string;
  email: string;
  googleId: string;
  picture: string;
  role: 'user' | 'admin';
  socialAccounts: ISocialAccount[];
  refreshTokenHash: string | null;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserModel extends Model<IUser> {
  isEmailTaken(email: string, excludeUserId?: mongoose.Types.ObjectId): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    fName: {
      type: String,
      required: true,
      trim: true,
    },
    lName: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows existing users without googleId
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
    picture: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    refreshTokenHash: {
      type: String,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.statics.isEmailTaken = async function (
  email: string,
  excludeUserId?: mongoose.Types.ObjectId
): Promise<boolean> {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Reuse existing model if already registered (avoids OverwriteModelError
 * during the JS → TS migration period).
 */
const User = mongoose.models['User']
  ? (mongoose.models['User'] as mongoose.Model<IUser> as IUserModel)
  : mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
