/**
 * Cloudinary signed image upload utility
 */

import axios from 'axios';
import { supabase } from '../lib/supabase';
import { API_URL } from '../services/api';

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

interface ArtistMediaAssetResponse {
  hasAsset: boolean;
  sourceImage?: string | null;
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

async function getArtistMediaAsset(musicbrainzMbid: string): Promise<ArtistMediaAssetResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await axios.get<ArtistMediaAssetResponse>(
    `${API_URL}/upload/artist-media/${musicbrainzMbid}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    }
  );

  return response.data;
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
export const uploadImageToCloudinary = async (
  file: File,
  options: { musicbrainzMbid?: string; allowExistingShared?: boolean } = {}
): Promise<string> => {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (options.musicbrainzMbid && !options.allowExistingShared) {
    const asset = await getArtistMediaAsset(options.musicbrainzMbid);
    if (asset.hasAsset) {
      throw new Error('This artist already has a shared image.');
    }
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
