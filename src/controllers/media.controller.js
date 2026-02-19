import * as mediaService from '../services/media.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Upload an encrypted media blob
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
 * Download an encrypted media blob
 * GET /api/media/:mediaId
 */
export const getMedia = async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { chatId } = req.query;
    const userId = req.user._id;

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
