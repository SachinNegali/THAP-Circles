import { Document, Model, Types } from 'mongoose';

export type NotificationType =
  | 'message.new'
  | 'message.deleted'
  | 'message.delivered'
  | 'message.read'
  | 'group.invite'
  | 'group.member_removed'
  | 'group.member_left'
  | 'group.role_updated'
  | 'group.updated'
  | 'group.deleted'
  | 'group.member_added'
  | 'trip.join_request';

export interface INotification extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: NotificationType | string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  isDelivered: boolean;
  createdAt: Date;
  updatedAt: Date;
  markAsRead(): Promise<INotification>;
  markAsDelivered(): Promise<INotification>;
}

declare const Notification: Model<INotification>;
export default Notification;
