import express from 'express';
import multer from 'multer';
import * as mediaController from '../../controllers/media.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// Configure multer for in-memory storage (legacy upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
});

// All routes require authentication
router.use(auth);

// ─── Presigned URL upload flow (new) ─────────────────────────────────────────
router.post('/upload/init', mediaController.initUpload);
router.post('/upload/complete', mediaController.completeUpload);
router.get('/upload/status/:imageId', mediaController.checkStatus);
router.post('/upload/status/batch', mediaController.batchStatus);

// ─── Legacy multer upload ────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), mediaController.uploadMedia);

// ─── Download (supports ?variant=thumbnail|optimized|original) ───────────────
router.get('/:mediaId', mediaController.getMedia);

export default router;
