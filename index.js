import dotenv from 'dotenv';
dotenv.config();

import app from './dist/app.js';
import connectDB from './dist/config/db.js';
import logger from './dist/config/logger.js';

// Image processing worker & reconciliation cron (same-process mode)
import './dist/workers/media.worker.js';
import './dist/cron/reconcile-uploads.js';

// Connect to Database
connectDB();

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});