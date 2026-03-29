"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateUserProfileFieldsAction } from "@/app/admin/actions";
import StickySaveBar from "@/app/admin/users/[id]/_components/StickySaveBar";

type ProfileFields = {
  full_name: string;
  phone: string;
  business_name: string;
  business_type: string;
  website: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  postal_code: string;
};

type AdminUserProfileEditorProps = {
  userId: string;
  initialValues: ProfileFields;
};

const FIELD_CONFIG: { name: keyof ProfileFields; placeholder: string }[] = [
  { name: "full_name", placeholder: "Full name" },
  { name: "phone", placeholder: "Phone" },
  { name: "business_name", placeholder: "Business name" },
  { name: "business_type", placeholder: "Business type slug" },
  { name: "website", placeholder: "Website" },
  { name: "address", placeholder: "Address" },
  { name: "address2", placeholder: "Address 2" },
  { name: "city", placeholder: "City" },
  { name: "state", placeholder: "State" },
  { name: "postal_code", placeholder: "Postal code" },
];

export default function AdminUserProfileEditor({ userId, initialValues }: AdminUserProfileEditorProps) {
  const [values, setValues] = useState<ProfileFields>(initialValues);
  const formId = `admin-user-profile-${userId}`;

  const dirty = useMemo(
    () => FIELD_CONFIG.some((field) => values[field.name] !== initialValues[field.name]),
    [values, initialValues]
  );

  function handleCancel() {
    setValues(initialValues);
  }

  return (
    <form action={updateUserProfileFieldsAction} id={formId} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="mb-2 font-medium">Edit profile fields</h3>
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELD_CONFIG.map((field) => (
          <input
            key={field.name}
            name={field.name}
            value={values[field.name]}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
            placeholder={field.placeholder}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
          />
        ))}
      </div>
      <ProfileSaveBar dirty={dirty} onCancel={handleCancel} formId={formId} />
    </form>
  );
}

function ProfileSaveBar({
  dirty,
  onCancel,
  formId,
}: {
  dirty: boolean;
  onCancel: () => void;
  formId: string;
}) {
  const { pending } = useFormStatus();

  return <StickySaveBar dirty={dirty} onCancel={onCancel} isSaving={pending} formId={formId} />;
}
