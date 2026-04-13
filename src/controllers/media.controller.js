import * as mediaService from '../services/media.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Upload an encrypted media blob (legacy — multer-based)
 * POST /api/media/upload
 */
export const uploadMedia = async (req, res) => {
  try {
    const { chatId, mimeType, sizeBytes } = req.body;
    const userId = req.user._id;
    const file = req.file;

    if (!file) {
      return sendBadRequest(res, 'File is required');
    }

    if (!chatId) {
      return sendBadRequest(res, 'chatId is required');
    }

    const data = await mediaService.uploadMedia(chatId, userId, file, {
      mimeType,
      sizeBytes: sizeBytes ? parseInt(sizeBytes) : undefined,
    });

    res.status(201).send({
      success: true,
      data: {
        url: data.url,
        sizeBytes: data.sizeBytes,
      },
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    if (error.code === 'E2E_005') {
      return sendE2EError(res, 'E2E_005');
    }
    return handleError(res, error, 'Failed to upload media');
  }
};

/**
 * Download an encrypted media blob / image variant
 * GET /api/media/:mediaId
 *
 * Supports ?variant=thumbnail|optimized|original for processed images.
 * Falls back to legacy chatId-based lookup if no variant is specified and chatId is present.
 */
export const getMedia = async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { chatId, variant } = req.query;
    const userId = req.user._id;

    // New variant-based flow for processed image uploads
    if (variant) {
      const result = await mediaService.getMediaVariant(mediaId, userId, variant);
      return res.redirect(302, result.presignedUrl);
    }

    // Legacy flow: requires chatId for access control
    if (!chatId) {
      return sendBadRequest(res, 'chatId query parameter is required for access control');
    }

    const range = req.headers.range || null;

    const result = await mediaService.getMedia(mediaId, userId, chatId, range);

    // Set response headers
    res.status(result.statusCode);
    res.set('Content-Type', result.contentType);
    res.set('Content-Length', result.contentLength);
    res.set('Accept-Ranges', result.acceptRanges);

    if (result.contentRange) {
      res.set('Content-Range', result.contentRange);
    }

    // Pipe the S3 stream to the response
    result.stream.pipe(res);
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to get media');
  }
};

// ─── Presigned URL Upload Endpoints ──────────────────────────────────────────

/**
 * Initialize an image upload — returns presigned S3 PUT URL.
 * POST /api/media/upload/init
 */
export const initUpload = async (req, res) => {
  try {
    const { chatId, messageId, imageId, mimeType, sizeBytes } = req.body;
    const userId = req.user._id;

    if (!chatId || !messageId || !imageId || !mimeType || !sizeBytes) {
      return sendBadRequest(res, 'chatId, messageId, imageId, mimeType, and sizeBytes are required');
    }

    const data = await mediaService.initUpload(chatId, userId, {
      messageId,
      imageId,
      mimeType,
      sizeBytes: parseInt(sizeBytes),
    });

    res.send({ success: true, data });
  } catch (error) {
    if (error.code === 'E2E_004') return sendE2EError(res, 'E2E_004');
    if (error.code === 'E2E_005') return sendE2EError(res, 'E2E_005');
    if (error.status) return res.status(error.status).send({ success: false, error: error.message });
    return handleError(res, error, 'Failed to initialize upload');
  }
};

/**
 * Confirm upload finished — verifies S3, enqueues processing.
 * POST /api/media/upload/complete
 */
export const completeUpload = async (req, res) => {
  try {
    const { imageId } = req.body;
    const userId = req.user._id;

    if (!imageId) {
      return sendBadRequest(res, 'imageId is required');
    }

    const data = await mediaService.completeUpload(imageId, userId);

    res.send({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).send({ success: false, error: error.message });
    return handleError(res, error, 'Failed to complete upload');
  }
};

/**
 * Check single upload status.
 * GET /api/media/upload/status/:imageId
 */
export const checkStatus = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user._id;

    const data = await mediaService.getUploadStatus(imageId, userId);

    res.send({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).send({ success: false, error: error.message });
    return handleError(res, error, 'Failed to get upload status');
  }
};

/**
 * Batch status check — for app relaunch recovery.
 * POST /api/media/upload/status/batch
 */
export const batchStatus = async (req, res) => {
  try {
    const { imageIds } = req.body;
    const userId = req.user._id;

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return sendBadRequest(res, 'imageIds array is required');
    }

    const data = await mediaService.batchUploadStatus(imageIds, userId);

    res.send({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to get batch status');
  }
};
