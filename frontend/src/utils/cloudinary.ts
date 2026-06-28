import axios from 'axios';
import { supabase } from '../lib/supabase';
import { API_URL } from '../services/api';
import type { CropArea } from '../types/artist';

// Cloudinary signed image upload utility

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
const MAX_NORMALIZED_IMAGE_SIZE = MAX_INPUT_IMAGE_SIZE;
const BASE_LANDSCAPE_MAX_WIDTH = 1920;
const BASE_LANDSCAPE_MAX_HEIGHT = 1080;
const BASE_PORTRAIT_MAX_WIDTH = 1080;
const BASE_PORTRAIT_MAX_HEIGHT = 1920;
const BASE_SQUARE_MAX_SIZE = 1080;
const QUALITY_TIER_SMALL_FILE = 2 * 1024 * 1024;
const QUALITY_TIER_MEDIUM_FILE = 3.5 * 1024 * 1024;
type ImageInputKind = 'jpeg' | 'png' | 'webp' | 'heic';

const INPUT_IMAGE_TYPES: Record<string, ImageInputKind> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heic',
};

const INPUT_IMAGE_EXTENSIONS: Record<string, ImageInputKind> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  heic: 'heic',
  heif: 'heic',
};

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
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function getImageInputKind(file: File): ImageInputKind | null {
  const mimeKind = INPUT_IMAGE_TYPES[file.type.toLowerCase()];
  if (mimeKind) return mimeKind;

  // iOS Safari can provide Photos library files with an empty or generic MIME type.
  return INPUT_IMAGE_EXTENSIONS[getFileExtension(file.name)] ?? null;
}

export const validateImageFile = (file: File): string | null => {
  if (!getImageInputKind(file)) {
    return 'Only JPG, PNG, WebP, HEIC, and HEIF images are allowed';
  }

  if (file.size > MAX_INPUT_IMAGE_SIZE) {
    return 'Image size must be smaller than 5 MB';
  }

  return null;
};

function getDimensionTrimRatio(fileSize: number): number {
  if (fileSize <= QUALITY_TIER_SMALL_FILE) {
    return 1;
  }

  if (fileSize <= QUALITY_TIER_MEDIUM_FILE) {
    return 0.875;
  }

  return 0.75;
}

function getDimensionCaps(fileSize: number) {
  const ratio = getDimensionTrimRatio(fileSize);

  return {
    landscapeMaxWidth: Math.round(BASE_LANDSCAPE_MAX_WIDTH * ratio),
    landscapeMaxHeight: Math.round(BASE_LANDSCAPE_MAX_HEIGHT * ratio),
    portraitMaxWidth: Math.round(BASE_PORTRAIT_MAX_WIDTH * ratio),
    portraitMaxHeight: Math.round(BASE_PORTRAIT_MAX_HEIGHT * ratio),
    squareMaxSize: Math.round(BASE_SQUARE_MAX_SIZE * ratio),
  };
}

function isWithinOutputResolution(width: number, height: number, fileSize: number): boolean {
  const caps = getDimensionCaps(fileSize);

  if (width === height) {
    return width <= caps.squareMaxSize;
  }

  return width >= height
    ? width <= caps.landscapeMaxWidth && height <= caps.landscapeMaxHeight
    : width <= caps.portraitMaxWidth && height <= caps.portraitMaxHeight;
}

function getTargetDimensions(width: number, height: number, fileSize: number): { width: number; height: number } {
  const caps = getDimensionCaps(fileSize);

  if (width === height) {
    const size = Math.min(width, caps.squareMaxSize);
    return { width: size, height: size };
  }

  const maxWidth = width > height ? caps.landscapeMaxWidth : caps.portraitMaxWidth;
  const maxHeight = width > height ? caps.landscapeMaxHeight : caps.portraitMaxHeight;
  const ratio = Math.min(1, maxWidth / width, maxHeight / height);

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
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'artist-image';
  return `${baseName}.${extension}`;
}

// Original size picks conservative normalized encoding targets
function getQualityCandidates(fileSize: number): number[] {
  if (fileSize <= QUALITY_TIER_SMALL_FILE) {
    return [0.98, 0.96, 0.94];
  }

  if (fileSize <= QUALITY_TIER_MEDIUM_FILE) {
    return [0.96, 0.94, 0.92];
  }

  return [0.94, 0.92, 0.9];
}

function getNormalizedImageOutputs(file: File, inputKind: ImageInputKind): Array<{ type: string; extension: string; qualities: number[] }> {
  if (inputKind === 'png') {
    // WebP fallback preserves transparency when resized PNG remains too large
    return [
      { type: 'image/png', extension: 'png', qualities: [1] },
      { type: 'image/webp', extension: 'webp', qualities: getQualityCandidates(file.size) },
    ];
  }

  if (inputKind === 'webp') {
    return [{ type: 'image/webp', extension: 'webp', qualities: getQualityCandidates(file.size) }];
  }

  return [{ type: 'image/jpeg', extension: 'jpg', qualities: getQualityCandidates(file.size) }];
}

type LoadedCanvasImage = {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
};

function loadHtmlImage(file: File): Promise<LoadedCanvasImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {
          image.removeAttribute('src');
          URL.revokeObjectURL(objectUrl);
        },
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image file'));
    };
    image.src = objectUrl;
  });
}

async function loadCanvasImage(file: File, inputKind: ImageInputKind): Promise<LoadedCanvasImage> {
  if (inputKind !== 'heic' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      };
    } catch {
      // Safari can fail createImageBitmap for File/Blob inputs that <img> can decode.
    }
  }

  return loadHtmlImage(file);
}

async function normalizeImageFile(file: File): Promise<File> {
  const inputKind = getImageInputKind(file);
  if (!inputKind) {
    throw new Error('Only JPG, PNG, WebP, HEIC, and HEIF images are allowed');
  }

  const image = await loadCanvasImage(file, inputKind);

  try {
    if (
      inputKind !== 'heic' &&
      file.size <= MAX_NORMALIZED_IMAGE_SIZE &&
      isWithinOutputResolution(image.width, image.height, file.size)
    ) {
      return file;
    }

    const dimensions = getTargetDimensions(image.width, image.height, file.size);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d', { alpha: inputKind === 'png' || inputKind === 'webp' });
    if (!context) {
      throw new Error('Image normalization is not supported in this browser');
    }

    // Browser high-quality resampling for dimension-only normalization
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, dimensions.width, dimensions.height);

    for (const output of getNormalizedImageOutputs(file, inputKind)) {
      for (const quality of output.qualities) {
        const blob = await canvasToBlob(canvas, output.type, quality);
        if (blob.size <= MAX_NORMALIZED_IMAGE_SIZE) {
          return new File([blob], replaceExtension(file.name, output.extension), {
            type: output.type,
            lastModified: Date.now(),
          });
        }
      }
    }
  } finally {
    image.close();
  }

  throw new Error('Image could not be resized under 5 MB without reducing quality too much');
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

export async function uploadImageFromWebUrlToCloudinary(imageUrl: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await axios.post<{ secureUrl: string }>(
    `${API_URL}/upload/from-url`,
    { imageUrl },
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );

  return response.data.secureUrl;
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
