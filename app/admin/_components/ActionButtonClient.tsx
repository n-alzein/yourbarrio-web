"use client";

import { useFormStatus } from "react-dom";

type ActionButtonClientProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

export default function ActionButtonClient({
  label,
  pendingLabel = "Working...",
  className,
  disabled = false,
}: ActionButtonClientProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button type="submit" disabled={isDisabled} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
