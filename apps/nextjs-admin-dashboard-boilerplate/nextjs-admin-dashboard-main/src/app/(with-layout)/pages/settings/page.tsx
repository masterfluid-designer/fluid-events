import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { PersonalInfoForm } from "./_components/personal-info";
import { UploadPhotoForm } from "./_components/upload-photo";

export const metadata: Metadata = {
  title: "Settings Page",
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user;

  return (
    <div className="mx-auto w-full max-w-270">
      <Breadcrumb pageName="Settings" />

      <div className="grid grid-cols-5 gap-8">
        <div className="col-span-5 xl:col-span-3">
          <PersonalInfoForm
            name={user?.name!}
            email={user?.email!}
            bio={user?.bio ?? undefined}
            phoneNumber={user?.phoneNumber?.toString()}
          />
        </div>
        <div className="col-span-5 xl:col-span-2">
          <UploadPhotoForm initialImage={user?.image ?? null} />
        </div>
      </div>
    </div>
  );
}
