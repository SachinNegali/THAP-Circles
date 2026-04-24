import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as mediaService from '../services/media.service.js';
import logger from '../config/logger.js';
import type {
  InitUploadInput,
  CompleteUploadInput,
  BatchStatusInput,
  UploadLegacyBody,
} from '../validations/media.validation.js';

const log = logger.child({ module: 'media' });

const E2E_STATUS: Record<string, number> = {
  E2E_001: 404,
  E2E_002: 410,
  E2E_003: 400,
  E2E_004: 403,
  E2E_005: 413,
};

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

/** Map service errors to HTTP responses without leaking internals. */
const handleServiceError = (
  res: Response,
  error: unknown,
  fallback: string
): void => {
  const anyErr = error as { code?: string; status?: number; message?: string };
  const message = anyErr?.message ?? fallback;

  if (anyErr?.code && E2E_STATUS[anyErr.code]) {
    res.status(E2E_STATUS[anyErr.code]!).json({
      success: false,
      code: anyErr.code,
      message,
    });
    return;
  }

  if (anyErr?.status) {
    res.status(anyErr.status).json({ success: false, message });
    return;
  }

  log.error({ err: error }, fallback);
  res.status(500).json({ success: false, message: fallback });
};

/** POST /media/upload — legacy multer upload. */
export const uploadMedia = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ message: 'File is required' });
      return;
    }

    const { chatId, mimeType, sizeBytes } = req.body as UploadLegacyBody;
    const data = await mediaService.uploadMedia(chatId, userId, file, {
      mimeType,
      sizeBytes,
    });

    res.status(201).json({
      success: true,
      data: { url: data.url, sizeBytes: data.sizeBytes },
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to upload media');
  }
};

/** GET /media/:mediaId */
export const getMedia = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const mediaId = String(req.params['mediaId']);
    const { chatId, variant } = req.query as unknown as {
      chatId?: string;
      variant?: 'thumbnail' | 'optimized' | 'original';
    };

    if (variant) {
      const result = await mediaService.getMediaVariant(mediaId, userId, variant);
      res.redirect(302, result.presignedUrl);
      return;
    }

    if (!chatId) {
      res
        .status(400)
        .json({ message: 'chatId query parameter is required for access control' });
      return;
    }

    const range = req.headers['range'] ?? null;
    const result = await mediaService.getMedia(mediaId, userId, chatId, range);

    res.status(result.statusCode);
    res.set('Content-Type', result.contentType);
    if (result.contentLength !== undefined) {
      res.set('Content-Length', String(result.contentLength));
    }
    res.set('Accept-Ranges', result.acceptRanges);
    if (result.contentRange) res.set('Content-Range', result.contentRange);

    result.stream.pipe(res);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get media');
  }
};

/** POST /media/upload/init */
export const initUpload = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { chatId, messageId, imageId, mimeType, sizeBytes } =
      req.body as InitUploadInput;
    const data = await mediaService.initUpload(chatId, userId, {
      messageId,
      imageId,
      mimeType,
      sizeBytes,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error, 'Failed to initialize upload');
  }
};

/** POST /media/upload/complete */
export const completeUpload = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { imageId } = req.body as CompleteUploadInput;
    const data = await mediaService.completeUpload(imageId, userId);
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error, 'Failed to complete upload');
  }
};

/** GET /media/upload/status/:imageId */
export const checkStatus = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const imageId = String(req.params['imageId']);
    const data = await mediaService.getUploadStatus(imageId, userId);
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get upload status');
  }
};

/** POST /media/upload/status/batch */
export const batchStatus = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { imageIds } = req.body as BatchStatusInput;
    const data = await mediaService.batchUploadStatus(imageIds, userId);
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get batch status');
  }
};
