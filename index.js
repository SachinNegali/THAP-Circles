import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';
import connectDB from './src/config/db.js';

// Connect to Database
connectDB();

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});