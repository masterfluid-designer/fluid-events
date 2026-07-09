"use client";

import { UploadIcon } from "@/assets/icons";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { authClient, getSession } from "@/lib/auth/auth-client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { UserIcon } from "./icons";

const MAX_FILE_SIZE = 1 * 1024 * 1024;

type UploadPhotoFormProps = {
  initialImage: string | null;
};

function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
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
}

export function UploadPhotoForm({ initialImage }: UploadPhotoFormProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageSrc, setImageSrc] = useState(initialImage);

  useEffect(() => {
    setImageSrc(initialImage);
  }, [initialImage]);

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large (max 1MB)");
      resetInput();
      return;
    }

    try {
      const base64 = await readFileAsDataURL(file);
      setImageSrc(base64);
    } catch {
      toast.error("Failed to read file");
    } finally {
      resetInput();
    }
  }

  function handleDelete() {
    setImageSrc(initialImage);
    resetInput();
  }

  function handleCancel() {
    setImageSrc(initialImage);
    resetInput();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!imageSrc || imageSrc === initialImage) {
      toast.info("No changes to save");
      return;
    }

    await toast.promise(
      (async () => {
        await authClient.updateUser({ image: imageSrc });
        await getSession();
        router.refresh();
      })(),
      {
        loading: "Saving photo...",
        success: "Photo updated successfully",
        error: "Upload failed",
      },
    );
  }

  return (
    <ShowcaseSection title="Your Photo" className="p-7!">
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center gap-3">
          {imageSrc ? (
            <Image
              src={imageSrc}
              width={55}
              height={55}
              alt="User photo"
              className="size-14 rounded-full object-cover"
              quality={90}
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-gray-2 text-dark dark:bg-dark-2 dark:text-white">
              <UserIcon className="size-7" />
            </div>
          )}

          <div>
            <span className="mb-1.5 font-medium text-dark dark:text-white">
              Edit your photo
            </span>
            <span className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                className="text-body-sm hover:text-red"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={openFilePicker}
                className="text-body-sm hover:text-primary"
              >
                Update
              </button>
            </span>
          </div>
        </div>

        <div className="relative mb-5.5 block w-full rounded-xl border border-dashed border-gray-4 bg-gray-2 hover:border-primary dark:border-dark-3 dark:bg-dark-2 dark:hover:border-primary">
          <input
            type="file"
            name="profilePhoto"
            id={inputId}
            ref={inputRef}
            accept="image/png, image/jpg, image/jpeg"
            hidden
            onChange={handleImageChange}
          />

          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center p-4 sm:py-7.5"
          >
            <div className="flex size-13.5 items-center justify-center rounded-full border border-stroke bg-white dark:border-dark-3 dark:bg-gray-dark">
              <UploadIcon />
            </div>

            <p className="mt-2.5 text-body-sm font-medium">
              <span className="text-primary">Click to upload</span> or drag and
              drop
            </p>

            <p className="mt-1 text-body-xs">PNG, JPG or JPEG (max, 1MB)</p>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="flex justify-center rounded-lg border border-stroke px-6 py-1.75 font-medium text-dark hover:shadow-1 dark:border-dark-3 dark:text-white"
            type="button"
          >
            Cancel
          </button>
          <button
            className="hover:bg-opacity-90 flex items-center justify-center rounded-lg bg-primary px-6 py-1.75 font-medium text-gray-2"
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </ShowcaseSection>
  );
}
