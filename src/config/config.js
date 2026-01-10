import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  mongoose: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/circles',
    options: {
      // useCreateIndex: true, // deprecated in Mongoose 6+
      // useNewUrlParser: true, // deprecated but often used
      // useUnifiedTopology: true, // deprecated but often used
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'secret-key-change-me',
    accessExpirationMinutes: process.env.JWT_ACCESS_EXPIRATION_MINUTES || 30,
    refreshExpirationDays: process.env.JWT_REFRESH_EXPIRATION_DAYS || 30,
  },
};
