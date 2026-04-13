import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';
import connectDB from './src/config/db.js';

// Image processing worker & reconciliation cron (same-process mode)
import './src/workers/media.worker.js';
import './src/cron/reconcile-uploads.js';

// Connect to Database
connectDB();

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`Server running at... http://localhost:${PORT}/`);
});