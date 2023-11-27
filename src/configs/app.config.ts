export const appConfigs = {
  BACKEND_URI: process.env.BACKEND_URL || '',
  IMAGE_SIZE: 256,
  IMAGE_DIMENSIONS_LIMIT:
    Number(process.env.IMAGE_DIMENSIONS_LIMIT) || 5000 * 5000,
  IMAGE_MEMORY_SIZE_LIMIT:
    Number(process.env.IMAGE_MEMORY_SIZE_LIMIT) || 20_000_000, // 20MB
  UPLOAD_BATCH_SIZE: Number(process.env.UPLOAD_BATCH_SIZE) || 10,
};
