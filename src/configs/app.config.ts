export const appConfigs = {
  BACKEND_URI: process.env.BACKEND_URL || '',
  IMAGE_SIZE: 256,
  IMAGE_DIMENSIONS_LIMIT:
    Number(process.env.IMAGE_DIMENSIONS_LIMIT) || 8000 * 6000,
  IMAGE_MEMORY_SIZE_LIMIT:
    Number(process.env.IMAGE_MEMORY_SIZE_LIMIT) || 50_000_000, // 50MB
  UPLOAD_BATCH_SIZE: Number(process.env.UPLOAD_BATCH_SIZE) || 30,
};
