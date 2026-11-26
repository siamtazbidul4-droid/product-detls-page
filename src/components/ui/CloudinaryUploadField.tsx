import { useId, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type { MediaAsset } from '../../types/domain.ts';

interface CloudinaryUploadFieldProps {
  folder: 'products' | 'categories' | 'brands' | 'cms' | 'promotions' | 'wishlist' | 'avatars';
  onUploaded: (asset: MediaAsset, response?: unknown) => void;
  label?: string;
  endpoint?: string;
  maxSizeMb?: number;
}

export function CloudinaryUploadField({
  folder,
  onUploaded,
  label = 'Upload Image via Cloudinary',
  endpoint = '/api/cms/admin/upload',
  maxSizeMb = 6,
}: CloudinaryUploadFieldProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      dispatch(pushToast({ variant: 'error', message: 'Select a valid JPEG, PNG, WebP, or GIF image.' }));
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      dispatch(pushToast({ variant: 'error', message: `Image must be smaller than ${maxSizeMb} MB.` }));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      formData.append('alt', file.name.replace(/\.[^.]+$/, ''));

      const res = await apiRequest<{ asset: MediaAsset }>(endpoint, {
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      onUploaded(res.asset, res);
      dispatch(pushToast({ variant: 'success', message: 'Image uploaded successfully.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          title: 'Upload Failed',
          message: err instanceof Error ? err.message : 'Image upload failed.',
        })
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="sr-only"
        id={inputId}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-emerald-400 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-800 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        <span>{uploading ? 'Uploading...' : label}</span>
      </button>
    </div>
  );
}
