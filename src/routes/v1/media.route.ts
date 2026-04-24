import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  initUploadSchema,
  completeUploadSchema,
  batchStatusSchema,
  uploadLegacyBodySchema,
  imageIdParamsSchema,
  mediaIdParamsSchema,
  getMediaQuerySchema,
} from '../../validations/media.validation.js';
import {
  uploadMedia,
  getMedia,
  initUpload,
  completeUpload,
  checkStatus,
  batchStatus,
} from '../../controllers/media.controller.js';

const router = Router();

/** In-memory multer for the legacy encrypted blob upload. 100 MB cap. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.use(authMiddleware);

router.post(
  '/upload/init',
  validate(initUploadSchema),
  initUpload
);

router.post(
  '/upload/complete',
  validate(completeUploadSchema),
  completeUpload
);

router.get(
  '/upload/status/:imageId',
  validate(imageIdParamsSchema, 'params'),
  checkStatus
);

router.post(
  '/upload/status/batch',
  validate(batchStatusSchema),
  batchStatus
);

router.post(
  '/upload',
  upload.single('file'),
  validate(uploadLegacyBodySchema),
  uploadMedia
);

router.get(
  '/:mediaId',
  validate(mediaIdParamsSchema, 'params'),
  validate(getMediaQuerySchema, 'query'),
  getMedia
);

export default router;
