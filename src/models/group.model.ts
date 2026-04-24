import mongoose, {
  HydratedDocument,
  Model,
  Schema,
  Types,
} from 'mongoose';

export type GroupType = 'dm' | 'group';
export type MemberRole = 'admin' | 'member';

export interface IGroupMember {
  user: Types.ObjectId;
  role: MemberRole;
  joinedAt: Date;
}

export interface IGroupSettings {
  onlyAdminsCanMessage: boolean;
  onlyAdminsCanEditInfo: boolean;
  maxMembers: number;
}

export interface IGroup {
  name?: string;
  type: GroupType;
  description?: string;
  avatar: string | null;
  createdBy: Types.ObjectId;
  members: IGroupMember[];
  settings: IGroupSettings;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupMethods {
  isMember(userId: Types.ObjectId | string): boolean;
  isAdmin(userId: Types.ObjectId | string): boolean;
  isCreator(userId: Types.ObjectId | string): boolean;
  addMember(userId: Types.ObjectId | string, role?: MemberRole): Promise<GroupDocument>;
  removeMember(userId: Types.ObjectId | string): Promise<GroupDocument>;
  updateMemberRole(userId: Types.ObjectId | string, newRole: MemberRole): Promise<GroupDocument>;
  getMemberCount(): number;
}

export type GroupDocument = HydratedDocument<IGroup, IGroupMethods>;
export type GroupModel = Model<IGroup, Record<string, never>, IGroupMethods>;

const groupSchema = new Schema<IGroup, GroupModel, IGroupMethods>(
  {
    name: {
      type: String,
      required: function (this: IGroup) {
        return this.type === 'group';
      },
      trim: true,
      maxlength: 100,
    },
    type: { type: String, enum: ['dm', 'group'], default: 'group', index: true },
    description: { type: String, trim: true, maxlength: 500 },
    avatar: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    settings: {
      onlyAdminsCanMessage: { type: Boolean, default: false },
      onlyAdminsCanEditInfo: { type: Boolean, default: true },
      maxMembers: { type: Number, default: 256, max: 1024 },
    },
    isActive: { type: Boolean, default: true },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

groupSchema.index({ 'members.user': 1 });
groupSchema.index({ createdBy: 1, isActive: 1 });
groupSchema.index({ lastActivity: -1 });
groupSchema.index({ isActive: 1, lastActivity: -1 });

const idEquals = (ref: unknown, target: string | Types.ObjectId): boolean => {
  if (!ref) return false;
  const refId =
    (ref as { _id?: Types.ObjectId })._id ?? (ref as Types.ObjectId | string);
  return refId.toString() === target.toString();
};

groupSchema.methods['isMember'] = function (
  this: GroupDocument,
  userId: Types.ObjectId | string
) {
  return this.members.some((m) => idEquals(m.user, userId));
};

groupSchema.methods['isAdmin'] = function (
  this: GroupDocument,
  userId: Types.ObjectId | string
) {
  const member = this.members.find((m) => idEquals(m.user, userId));
  return !!member && member.role === 'admin';
};

groupSchema.methods['isCreator'] = function (
  this: GroupDocument,
  userId: Types.ObjectId | string
) {
  return idEquals(this.createdBy, userId);
};

groupSchema.methods['addMember'] = async function (
  this: GroupDocument,
  userId: Types.ObjectId | string,
  role: MemberRole = 'member'
) {
  if (this.isMember(userId)) throw new Error('User is already a member');
  if (this.members.length >= this.settings.maxMembers) {
    throw new Error('Group has reached maximum member limit');
  }
  this.members.push({
    user: new Types.ObjectId(userId.toString()),
    role,
    joinedAt: new Date(),
  });
  this.lastActivity = new Date();
  return this.save();
};

groupSchema.methods['removeMember'] = async function (
  this: GroupDocument,
  userId: Types.ObjectId | string
) {
  const idx = this.members.findIndex((m) => m.user.toString() === userId.toString());
  if (idx === -1) throw new Error('User is not a member');
  this.members.splice(idx, 1);
  this.lastActivity = new Date();
  return this.save();
};

groupSchema.methods['updateMemberRole'] = async function (
  this: GroupDocument,
  userId: Types.ObjectId | string,
  newRole: MemberRole
) {
  const member = this.members.find((m) => m.user.toString() === userId.toString());
  if (!member) throw new Error('User is not a member');
  member.role = newRole;
  this.lastActivity = new Date();
  return this.save();
};

groupSchema.methods['getMemberCount'] = function (this: GroupDocument) {
  return this.members.length;
};

const Group = (mongoose.models['Group'] as GroupModel) ||
  mongoose.model<IGroup, GroupModel>('Group', groupSchema);

export default Group;
