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

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return 'Image size must be smaller than 5 MB';
  }

  return null;
};

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

  const { signature, timestamp, publicId, apiKey, cloudName } = await getUploadSignature();

  const formData = new FormData();
  formData.append('file', file);
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
