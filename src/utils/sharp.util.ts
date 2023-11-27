import bmp from '@vingle/bmp-js';
import sharp, { Sharp } from 'sharp';

const BUF_BMP = Buffer.from([0x42, 0x4d]); // "BM" file signature

const isBitmap = (buf: Buffer): boolean => {
  return Buffer.compare(BUF_BMP, buf.slice(0, 2)) === 0;
};

export const createSharpInstance = (input: Buffer): Sharp => {
  if (isBitmap(input)) {
    const bitmap = bmp.decode(input, true);
    return sharp(bitmap.data, {
      raw: {
        width: bitmap.width,
        height: bitmap.height,
        channels: 4,
      },
    }).toFormat('jpg');
  }
  return sharp(input);
};
