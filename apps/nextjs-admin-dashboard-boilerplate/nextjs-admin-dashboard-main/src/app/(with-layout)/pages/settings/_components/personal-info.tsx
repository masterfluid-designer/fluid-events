"use client";

import {
  CallIcon,
  EmailIcon,
  PencilSquareIcon,
  UserIcon,
} from "@/assets/icons";
import InputGroup from "@/components/FormElements/InputGroup";
import { TextAreaGroup } from "@/components/FormElements/InputGroup/text-area";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { authClient } from "@/lib/auth/auth-client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export interface UserInfo {
  name: string;
  phoneNumber?: string;
  email: string;
  bio?: string;
}

export function PersonalInfoForm(personalInfo: UserInfo) {
  const { name, phoneNumber = "", email, bio = "" } = personalInfo;

  const [formData, setFormData] = useState<UserInfo>({
    name: name,
    phoneNumber: phoneNumber,
    email: email,
    bio: bio,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleReset = () => {
    setFormData({
      name: name,
      phoneNumber: phoneNumber,
      email: email,
      bio: bio,
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updatePayload = {
        name: formData.name,
        phoneNumber: Number(formData.phoneNumber),
        bio: formData.bio,
      };

      const updatePromise = authClient.updateUser(updatePayload);

      toast.promise(updatePromise, {
        loading: "Updating profile...",
        success: "Profile updated successfully!",
        error: "Failed to update profile. Please try again.",
      });

      await updatePromise;
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!personalInfo.email) {
    return (
      <ShowcaseSection title="Personal Information" className="p-7!">
        <div className="flex items-center justify-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </ShowcaseSection>
    );
  }

  return (
    <ShowcaseSection title="Personal Information" className="p-7!">
      <form onSubmit={handleSubmit}>
        <div className="mb-5.5 flex flex-col gap-5.5 sm:flex-row">
          <InputGroup
            className="w-full sm:w-1/2"
            type="text"
            name="name"
            label="Full Name"
            placeholder="David Jhon"
            value={formData.name}
            handleChange={handleInputChange}
            icon={<UserIcon />}
            iconPosition="left"
            height="sm"
            disabled={isLoading}
          />

          <InputGroup
            className="w-full sm:w-1/2"
            type="text"
            name="phoneNumber"
            label="Phone Number"
            placeholder="+990 3343 7865"
            value={formData.phoneNumber}
            handleChange={handleInputChange}
            icon={<CallIcon />}
            iconPosition="left"
            height="sm"
            disabled={isLoading}
          />
        </div>

        <InputGroup
          className="mb-5.5"
          type="email"
          name="email"
          label="Email Address"
          placeholder="devidjond45@gmail.com"
          value={formData.email}
          handleChange={handleInputChange}
          icon={<EmailIcon />}
          iconPosition="left"
          height="sm"
          disabled
        />

        <InputGroup
          className="mb-5.5"
          type="text"
          name="username"
          label="Username"
          placeholder="devidjhon24"
          handleChange={handleInputChange}
          icon={<UserIcon />}
          iconPosition="left"
          height="sm"
          disabled
        />

        <TextAreaGroup
          className="mb-5.5"
          name="bio"
          label="BIO"
          placeholder="Write your bio here"
          icon={<PencilSquareIcon />}
          value={formData.bio}
          onChange={handleInputChange}
          disabled={isLoading}
        />

        <div className="flex justify-end gap-3">
          <button
            className="rounded-lg border border-stroke px-6 py-1.75 font-medium text-dark hover:shadow-1 disabled:opacity-50 dark:border-dark-3 dark:text-white"
            type="button"
            onClick={handleReset}
            disabled={isLoading}
          >
            Cancel
          </button>

          <button
            className="hover:bg-opacity-90 rounded-lg bg-primary px-6 py-1.75 font-medium text-gray-2 disabled:opacity-50"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </ShowcaseSection>
  );
}
