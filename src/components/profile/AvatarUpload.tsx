"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compressImage";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";

export default function AvatarUpload({
  userId,
  currentUrl,
  name,
}: {
  userId: string;
  currentUrl: string | null;
  name: string;
}) {
  const [avatarUrl, setAvatarUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const compressed = await compressImage(file);

      // Fixed path per user (not a new filename each time) so re-uploading
      // overwrites instead of accumulating old avatars in storage forever.
      const path = `${userId}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new photo shows immediately instead of a stale
      // cached copy at the same URL.
      const urlWithVersion = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlWithVersion })
        .eq("id", userId);
      if (updateError) throw updateError;

      setAvatarUrl(urlWithVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarThumbnail url={avatarUrl} name={name} size={64} className="text-lg" />
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          {uploading ? "Uploading..." : "Change Photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-[11px] text-slate-400 mt-1">JPG or PNG, up to 5MB</p>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
