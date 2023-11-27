export const appConfigs = {
  ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  ORIGIN: process.env.ORIGIN || '',
  BACKEND_URI: process.env.BACKEND_URL || '',
  IMAGE_SIZE: 256,
  IMAGE_DIMENSIONS_LIMIT:
    Number(process.env.IMAGE_DIMENSIONS_LIMIT) || 8000 * 6000,
  IMAGE_MEMORY_SIZE_LIMIT:
    Number(process.env.IMAGE_MEMORY_SIZE_LIMIT) || 50_000_000, // 50MB
  PAGE_SIZE: 12,
  UPLOAD_BATCH_SIZE: Number(process.env.UPLOAD_BATCH_SIZE) || 30,
  MAX_GET_TRAINING_STATS_LOOP: 60,
  GET_TRAINING_STATS_TIMEOUT: 1000,
};
