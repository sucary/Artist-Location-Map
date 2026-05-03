/**
 * Cloudinary signed image upload utility
 */

import axios from 'axios';
import { supabase } from '../lib/supabase';
import { API_URL } from '../services/api';
import type { CropArea } from '../types/artist';

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

interface CloudinaryError {
  error: {
    message: string;
  };
}

interface SignatureResponse {
  signature: string;
  timestamp: number;
  publicId: string;
  apiKey: string;
  cloudName: string;
}

const MAX_INPUT_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_SIZE = 1 * 1024 * 1024;
const LANDSCAPE_MAX_WIDTH = 1920;
const LANDSCAPE_MAX_HEIGHT = 1080;
const PORTRAIT_MAX_WIDTH = 1080;
const PORTRAIT_MAX_HEIGHT = 1920;
const SQUARE_MAX_SIZE = 1080;
const MIN_JPEG_QUALITY = 0.82;
const JPEG_QUALITIES = [0.92, 0.88, 0.85, 0.82];
const RESIZE_STEPS = [1, 0.92, 0.84, 0.76, 0.68];

export interface ArtistMediaAssetStatus {
  hasAsset: boolean;
  sourceImage?: string | null;
  avatarCrop?: CropArea | null;
  profileCrop?: CropArea | null;
  canReplaceDirectly: boolean;
  requiresReview: boolean;
}


/**
 * Validates image file before upload
 */
export const validateImageFile = (file: File): string | null => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are allowed';
  }

  if (file.size > MAX_INPUT_IMAGE_SIZE) {
    return 'Image size must be smaller than 5 MB';
  }

  return null;
};

function isWithinOutputResolution(width: number, height: number): boolean {
  if (width === height) {
    return width <= SQUARE_MAX_SIZE;
  }

  return width >= height
    ? width <= LANDSCAPE_MAX_WIDTH && height <= LANDSCAPE_MAX_HEIGHT
    : width <= PORTRAIT_MAX_WIDTH && height <= PORTRAIT_MAX_HEIGHT;
}

function getTargetDimensions(width: number, height: number, scale: number = 1): { width: number; height: number } {
  if (width === height) {
    const size = Math.min(width, Math.round(SQUARE_MAX_SIZE * scale));
    return { width: size, height: size };
  }

  const maxWidth = width > height ? LANDSCAPE_MAX_WIDTH : PORTRAIT_MAX_WIDTH;
  const maxHeight = width > height ? LANDSCAPE_MAX_HEIGHT : PORTRAIT_MAX_HEIGHT;
  const ratio = Math.min(1, (maxWidth * scale) / width, (maxHeight * scale) / height);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to normalize image'));
      }
    }, type, quality);
  });
}

function replaceExtension(fileName: string, extension: string): string {
  return fileName.replace(/\.[^.]+$/, '') + `.${extension}`;
}

async function normalizeImageFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  if (
    file.size <= MAX_OUTPUT_IMAGE_SIZE &&
    isWithinOutputResolution(bitmap.width, bitmap.height)
  ) {
    bitmap.close?.();
    return file;
  }

  for (const resizeStep of RESIZE_STEPS) {
    const dimensions = getTargetDimensions(bitmap.width, bitmap.height, resizeStep);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      bitmap.close?.();
      throw new Error('Image normalization is not supported in this browser');
    }

    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob.size <= MAX_OUTPUT_IMAGE_SIZE) {
        bitmap.close?.();
        return new File([blob], replaceExtension(file.name, 'jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      if (quality <= MIN_JPEG_QUALITY) {
        break;
      }
    }
  }

  bitmap.close?.();
  throw new Error('Image could not be compressed under 1 MB without reducing quality too much');
}

/**
 * Fetches a signed upload signature from the backend
 */
async function getUploadSignature(): Promise<SignatureResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await axios.post<SignatureResponse>(
    `${API_URL}/upload/signature`,
    {},
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );

  return response.data;
}

export async function getArtistMediaAssetStatus(musicbrainzMbid: string): Promise<ArtistMediaAssetStatus> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await axios.get<ArtistMediaAssetStatus>(
    `${API_URL}/upload/artist-media/${musicbrainzMbid}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );

  return response.data;
}

export async function deleteUploadedImage(secureUrl: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  await axios.delete(
    `${API_URL}/upload/uploaded-image`,
    {
      data: { secureUrl },
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );
}

async function recordUploadComplete(data: CloudinaryUploadResponse): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  await axios.post(
    `${API_URL}/upload/complete`,
    {
      publicId: data.public_id,
      secureUrl: data.secure_url,
      bytes: data.bytes,
      width: data.width,
      height: data.height,
      format: data.format,
    },
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );
}

/**
 * Uploads image to Cloudinary using a signed request
 * @returns The secure URL of the uploaded image
 */
export const uploadImageToCloudinary = async (file: File): Promise<string> => {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const normalizedFile = await normalizeImageFile(file);
  const { signature, timestamp, publicId, apiKey, cloudName } = await getUploadSignature();

  const formData = new FormData();
  formData.append('file', normalizedFile);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('public_id', publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData: CloudinaryError = await response.json();
    throw new Error(errorData.error?.message || 'Upload failed');
  }

  const data: CloudinaryUploadResponse = await response.json();
  await recordUploadComplete(data);

  return data.secure_url;
};
