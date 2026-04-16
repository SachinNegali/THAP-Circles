import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export interface IEmergencyContact {
  _id?: Types.ObjectId;
  name: string;
  phone: string;
  relation?: string;
}

export interface IAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface IUserProfile extends Document {
  user: Types.ObjectId;
  bloodGroup?: BloodGroup;
  address?: IAddress;
  emergencyContacts: Types.DocumentArray<IEmergencyContact & Document>;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserProfileModel extends Model<IUserProfile> {
  findByUser(userId: Types.ObjectId | string): Promise<IUserProfile | null>;
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const emergencyContactSchema = new Schema<IEmergencyContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    relation: { type: String, trim: true, maxlength: 50 },
  },
  { _id: true, timestamps: false }
);

const addressSchema = new Schema<IAddress>(
  {
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false }
);

const userProfileSchema = new Schema<IUserProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    bloodGroup: {
      type: String,
      enum: BLOOD_GROUPS,
    },
    address: { type: addressSchema },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
  },
  { timestamps: true }
);

userProfileSchema.statics.findByUser = function (userId: Types.ObjectId | string) {
  return this.findOne({ user: userId });
};

const UserProfile = mongoose.models['UserProfile']
  ? (mongoose.models['UserProfile'] as mongoose.Model<IUserProfile> as IUserProfileModel)
  : mongoose.model<IUserProfile, IUserProfileModel>('UserProfile', userProfileSchema);

export default UserProfile;
