/**
 * User Model — OAuth-Only, Passwordless
 * =======================================
 *
 * SECURITY DECISIONS:
 * - googleId (payload.sub) is the canonical unique identifier, NOT email.
 *   Google guarantees sub is stable; emails can change.
 * - refreshTokenHash stores a SHA-256 hash, NEVER the raw token.
 *   If the DB is compromised, attackers cannot forge refresh tokens.
 * - tokenVersion is incremented on logout to immediately invalidate
 *   ALL existing access tokens without maintaining a denylist.
 * - No password field — this is OAuth-only. Eliminates an entire class
 *   of vulnerabilities (brute force, credential stuffing, etc.).
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  googleId: string;
  name: string;
  picture: string;
  role: 'user' | 'admin';
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
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      /**
       * SECURITY: Email comes ONLY from the verified Google payload,
       * never from the frontend request body.
       */
    },
    googleId: {
      type: String,
      required: true,
      unique: true,
      /**
       * SECURITY: This is payload.sub from the verified Google token.
       * It is the only stable, unique identifier for a Google account.
       * We index and look up users by this field, not by email.
       */
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
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
      /**
       * SECURITY: We store a SHA-256 hash of the refresh token,
       * never the raw value. Even if the database is breached,
       * the attacker cannot reconstruct the refresh token.
       */
    },
    tokenVersion: {
      type: Number,
      default: 0,
      /**
       * SECURITY: Incremented on logout. All JWTs issued before
       * the increment carry the old version and will be rejected
       * by the auth middleware without needing a token blacklist.
       */
    },
  },
  {
    timestamps: true,
  }
);

/** Indexes already created by unique: true on schema fields */


/**
 * Check if email is taken
 * @param email - The user's email
 * @param excludeUserId - The id of the user to be excluded
 */
userSchema.statics.isEmailTaken = async function (
  email: string,
  excludeUserId?: mongoose.Types.ObjectId
): Promise<boolean> {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};
/**
 * Reuse existing model if already registered (avoids OverwriteModelError
 * during the JS → TS migration period where both old and new models
 * may be imported in the same process).
 */
const User = mongoose.models['User']
  ? (mongoose.models['User'] as mongoose.Model<IUser> as IUserModel)
  : mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
