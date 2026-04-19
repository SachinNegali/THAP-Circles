import mongoose from 'mongoose';
import logger from './logger.js';

const log = logger.child({ module: 'db' });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/circles');
    log.info({ host: conn.connection.host }, 'MongoDB connected');
  } catch (error) {
    log.fatal({ err: error }, 'MongoDB connection failed');
    process.exit(1);
  }
};

export default connectDB;