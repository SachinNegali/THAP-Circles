import mongoose, {
  HydratedDocument,
  Model,
  Schema,
  Types,
} from 'mongoose';

export type MessageType = 'text' | 'image' | 'file' | 'system' | 'spend';

export interface IMessageImage {
  imageId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  thumbnailUrl: string | null;
  optimizedUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType?: string | null;
  mediaType?: 'image' | 'video';
}

export interface IMessageMetadata {
  imageIds?: string[];
  images?: IMessageImage[];
  expenseId?: Types.ObjectId;
  amount?: number;
  category?: string;
  paidBy?: Types.ObjectId;
  splitCount?: number;
  splitType?: 'equal' | 'custom';
  currency?: string;
  [key: string]: unknown;
}

export interface IMessage {
  group: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  type: MessageType;
  metadata: IMessageMetadata;
  isDeleted: boolean;
  deletedAt: Date | null;
  readBy: Types.ObjectId[];
  deliveredTo: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessageMethods {
  softDelete(): Promise<MessageDocument>;
  markAsReadBy(userId: Types.ObjectId | string): Promise<MessageDocument>;
  isReadBy(userId: Types.ObjectId | string): boolean;
  markAsDeliveredTo(userId: Types.ObjectId | string): Promise<MessageDocument>;
  isDeliveredTo(userId: Types.ObjectId | string): boolean;
  getDeliveryStatus(totalMembers: number): {
    total: number;
    delivered: number;
    read: number;
  };
}

export type MessageDocument = HydratedDocument<IMessage, IMessageMethods>;
export type MessageModel = Model<IMessage, Record<string, never>, IMessageMethods>;

const messageSchema = new Schema<IMessage, MessageModel, IMessageMethods>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 5000 },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system', 'spend'],
      default: 'text',
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ sender: 1, group: 1 });
messageSchema.index({ group: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ deliveredTo: 1 });

messageSchema.methods['softDelete'] = async function (this: MessageDocument) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

messageSchema.methods['markAsReadBy'] = async function (
  this: MessageDocument,
  userId: Types.ObjectId | string
) {
  const exists = this.readBy.some((id) => id.toString() === userId.toString());
  if (!exists) {
    this.readBy.push(new Types.ObjectId(userId.toString()));
    return this.save();
  }
  return this;
};

messageSchema.methods['isReadBy'] = function (
  this: MessageDocument,
  userId: Types.ObjectId | string
) {
  return this.readBy.some((id) => id.toString() === userId.toString());
};

messageSchema.methods['markAsDeliveredTo'] = async function (
  this: MessageDocument,
  userId: Types.ObjectId | string
) {
  const exists = this.deliveredTo.some(
    (id) => id.toString() === userId.toString()
  );
  if (!exists) {
    this.deliveredTo.push(new Types.ObjectId(userId.toString()));
    return this.save();
  }
  return this;
};

messageSchema.methods['isDeliveredTo'] = function (
  this: MessageDocument,
  userId: Types.ObjectId | string
) {
  return this.deliveredTo.some((id) => id.toString() === userId.toString());
};

messageSchema.methods['getDeliveryStatus'] = function (
  this: MessageDocument,
  totalMembers: number
) {
  return {
    total: totalMembers,
    delivered: this.deliveredTo.length,
    read: this.readBy.length,
  };
};

const Message = (mongoose.models['Message'] as MessageModel) ||
  mongoose.model<IMessage, MessageModel>('Message', messageSchema);

export default Message;
