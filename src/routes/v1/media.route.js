import express from 'express';
import multer from 'multer';
import * as mediaController from '../../controllers/media.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// Configure multer for in-memory storage (we upload the buffer to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
});

// All routes require authentication
router.use(auth);

// Media operations
router.post('/upload', upload.single('file'), mediaController.uploadMedia);
router.get('/:mediaId', mediaController.getMedia);

export default router;
