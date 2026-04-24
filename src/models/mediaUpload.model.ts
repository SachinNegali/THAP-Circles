import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type MediaUploadStatus =
  | 'pending'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'failed';

export interface IMediaUpload extends Document {
  imageId: string;
  messageId: string;
  chatId: Types.ObjectId;
  userId: Types.ObjectId;
  s3Key: string;
  thumbnailS3Key: string | null;
  optimizedS3Key: string | null;
  status: MediaUploadStatus;
  mimeType: string;
  sizeBytes?: number;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  optimizedUrl: string | null;
  presignedUrlExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type MediaUploadModel = Model<IMediaUpload>;

const mediaUploadSchema = new Schema<IMediaUpload>({
  imageId: { type: String, required: true, unique: true, index: true },
  messageId: { type: String, required: true },
  chatId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  s3Key: { type: String, required: true },
  thumbnailS3Key: { type: String, default: null },
  optimizedS3Key: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'uploaded', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  mimeType: { type: String, default: 'image/jpeg' },
  sizeBytes: { type: Number },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  thumbnailUrl: { type: String, default: null },
  optimizedUrl: { type: String, default: null },
  presignedUrlExpiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

mediaUploadSchema.index({ messageId: 1, status: 1 });
mediaUploadSchema.index({ status: 1, createdAt: 1 });

const MediaUpload = (mongoose.models['MediaUpload'] as MediaUploadModel) ||
  mongoose.model<IMediaUpload>('MediaUpload', mediaUploadSchema);

export default MediaUpload;
