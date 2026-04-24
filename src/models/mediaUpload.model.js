import mongoose from 'mongoose';

const mediaUploadSchema = new mongoose.Schema({
  imageId:               { type: String, required: true, unique: true, index: true },
  messageId:             { type: String, required: true },
  chatId:                { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  userId:                { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  s3Key:                 { type: String, required: true },
  thumbnailS3Key:        { type: String, default: null },
  optimizedS3Key:        { type: String, default: null },
  status:                { type: String, enum: ['pending', 'uploaded', 'processing', 'completed', 'failed'], default: 'pending' },
  mimeType:              { type: String, default: 'image/jpeg' },
  sizeBytes:             { type: Number },
  width:                 { type: Number, default: null },
  height:                { type: Number, default: null },
  thumbnailUrl:          { type: String, default: null },
  optimizedUrl:          { type: String, default: null },
  presignedUrlExpiresAt: { type: Date },
  createdAt:             { type: Date, default: Date.now },
  updatedAt:             { type: Date, default: Date.now },
});

mediaUploadSchema.index({ messageId: 1, status: 1 });
mediaUploadSchema.index({ status: 1, createdAt: 1 });

// Reuse existing model if already registered (avoids conflict with TS version)
const MediaUpload = mongoose.models.MediaUpload || mongoose.model('MediaUpload', mediaUploadSchema);

export default MediaUpload;
