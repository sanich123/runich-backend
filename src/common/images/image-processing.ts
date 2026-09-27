import sharp from 'sharp';

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 85;

export async function normalizeImage(input: string | Buffer) {
  return await sharp(input)
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_QUALITY })
    .toBuffer();
}
