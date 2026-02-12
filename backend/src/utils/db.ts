import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) {
    logger.info('Using existing MongoDB connection');
    return;
  }

  try {
    const uri = config.MONGO_URI;
    await mongoose.connect(uri, {
      dbName: config.MONGO_DB,
      ...(config.MONGO_USERNAME && config.MONGO_PASSWORD && {
        auth: {
          username: config.MONGO_USERNAME,
          password: config.MONGO_PASSWORD,
        },
      }),
    });

    isConnected = true;
    logger.info(`MongoDB connected: ${config.MONGO_DB}`);
  } catch (error) {
    logger.error({ error }, 'MongoDB connection failed');
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected');
}
