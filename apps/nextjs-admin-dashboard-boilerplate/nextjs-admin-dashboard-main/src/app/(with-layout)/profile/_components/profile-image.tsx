"use client";

import { authClient, getSession } from "@/lib/auth/auth-client";
import Image from "next/image";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CameraIcon, UserIcon } from "./icons";

const MAX_FILE_SIZE = 1 * 1024 * 1024;

type ProfileImageUploaderProps = {
  initialImage: string | null;
  name: string;
};

export function ProfileImageUploader({
  initialImage,
  name,
}: ProfileImageUploaderProps) {
  const inputId = useId();
  const [imageSrc, setImageSrc] = useState(initialImage);

  useEffect(() => {
    setImageSrc(initialImage);
  }, [initialImage]);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large (max 1MB)");
      return;
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Failed to read file"));
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });

    setImageSrc(base64);

    try {
      await authClient.updateUser({ image: base64 });
      await getSession();
    } catch {
      toast.error("Upload failed");
    }
  }

  return (
    <div className="relative z-30 mx-auto -mt-22 h-30 w-full max-w-30 rounded-full bg-white/20 p-1 backdrop-blur sm:h-44 sm:max-w-44 sm:p-3">
      <div className="relative flex items-center justify-center drop-shadow-2">
        {imageSrc ? (
          <Image
            src={imageSrc}
            width={160}
            height={160}
            className="size-28 overflow-hidden rounded-full object-cover sm:size-40"
            alt={`${name} profile image`}
          />
        ) : (
          <span className="mx-auto flex size-40 items-center justify-center gap-2.5 rounded-full bg-white px-2.5 py-2.25">
            <UserIcon className="size-1/2" />
          </span>
        )}

        <label
          htmlFor={inputId}
          className="hover:bg-opacity-90 absolute right-0 bottom-0 flex size-8.5 cursor-pointer items-center justify-center rounded-full bg-primary text-white sm:right-2 sm:bottom-2"
        >
          <CameraIcon />

          <input
            type="file"
            id={inputId}
            className="sr-only"
            onChange={handleImageChange}
            accept="image/png, image/jpg, image/jpeg"
          />
        </label>
      </div>
    </div>
  );
}
