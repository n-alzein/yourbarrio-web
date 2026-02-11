"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type DangerConfirmClientProps = {
  confirmWord?: string;
  warning: string;
  buttonLabel: string;
  pendingLabel?: string;
  buttonClassName?: string;
  inputClassName?: string;
  warningClassName?: string;
};

export default function DangerConfirmClient({
  confirmWord = "HIDE",
  warning,
  buttonLabel,
  pendingLabel = "Working...",
  buttonClassName,
  inputClassName,
  warningClassName,
}: DangerConfirmClientProps) {
  const { pending } = useFormStatus();
  const [value, setValue] = useState("");
  const isConfirmed = value.trim().toUpperCase() === confirmWord;

  return (
    <div className="space-y-2">
      <p className={warningClassName}>{warning}</p>
      <label className="block text-xs text-neutral-400">
        Type {confirmWord} to confirm
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClassName}
          placeholder={confirmWord}
        />
      </label>
      <button
        type="submit"
        disabled={!isConfirmed || pending}
        className={buttonClassName}
      >
        {pending ? pendingLabel : buttonLabel}
      </button>
    </div>
  );
}
