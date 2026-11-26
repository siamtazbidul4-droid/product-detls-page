import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.ts';
import {
  BrandModel,
  CategoryModel,
  CollectionModel,
  ProductModel,
  type ICloudinaryAsset,
} from '../modules/catalog/catalog.model.ts';
import {
  HomepageConfigModel,
  PromotionalPlacementModel,
  WishlistHeroSlideModel,
} from '../modules/cms/cms.model.ts';
import { UserModel } from '../modules/users/user.model.ts';

let configured = false;

function ensureCloudinaryConfigured(): void {
  if (!env.cloudinary.isConfigured) {
    throw Object.assign(
      new Error(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
      ),
      { statusCode: 503, code: 'CLOUDINARY_UNCONFIGURED' }
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
}

export function detectImageSignature(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  // GIF: GIF87a or GIF89a
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  return null;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string,
  alt?: string
): Promise<ICloudinaryAsset> {
  ensureCloudinaryConfigured();

  const detectedFormat = detectImageSignature(buffer);
  if (!detectedFormat) {
    throw Object.assign(
      new Error('Unsupported or corrupted image file. Only valid JPEG, PNG, WebP, or GIF images are allowed.'),
      { statusCode: 400, code: 'INVALID_IMAGE_FILE' }
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `novara-commerce/${folder}`,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(
            Object.assign(
              new Error(error?.message || 'Cloudinary upload failed'),
              { statusCode: 502, code: 'CLOUDINARY_UPLOAD_FAILED' }
            )
          );
          return;
        }
        resolve({
          publicId: result.public_id,
          url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          alt: alt || '',
        });
      }
    );

    uploadStream.end(buffer);
  });
}

export async function destroyCloudinaryAssetIfUnused(publicId?: string | null): Promise<void> {
  if (!publicId || !env.cloudinary.isConfigured) return;

  // Verify asset is not referenced anywhere else before deleting from Cloudinary
  const [productRef, categoryRef, brandRef, collectionRef, adRef, heroRef, wishlistSlideRef, userAvatarRef] =
    await Promise.all([
      ProductModel.exists({
        $or: [{ 'images.publicId': publicId }, { 'variants.image.publicId': publicId }],
      }),
      CategoryModel.exists({ 'image.publicId': publicId }),
      BrandModel.exists({ 'logo.publicId': publicId }),
      CollectionModel.exists({ 'image.publicId': publicId }),
      PromotionalPlacementModel.exists({ imagePublicId: publicId }),
      HomepageConfigModel.exists({
        $or: [
          { 'heroSlides.imagePublicId': publicId },
          { 'dualBanners.imagePublicId': publicId },
        ],
      }),
      WishlistHeroSlideModel.exists({
        $or: [{ desktopImagePublicId: publicId }, { mobileImagePublicId: publicId }],
      }),
      UserModel.exists({ avatarPublicId: publicId }),
    ]);

  if (
    productRef ||
    categoryRef ||
    brandRef ||
    collectionRef ||
    adRef ||
    heroRef ||
    wishlistSlideRef ||
    userAvatarRef
  ) {
    return;
  }

  try {
    ensureCloudinaryConfigured();
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('[Cloudinary] Failed to destroy unused asset:', publicId, err);
  }
}
