import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    console.log("uri....", process.env.MONGO_URI)
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/circles');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;