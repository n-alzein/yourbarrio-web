"use client";

import { useState } from "react";

type CopyIdButtonClientProps = {
  value: string;
  className?: string;
};

export default function CopyIdButtonClient({ value, className }: CopyIdButtonClientProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1400);
    } catch {
      setStatus("failed");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  const label = status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy ID";

  return (
    <button type="button" onClick={onCopy} className={className}>
      {label}
    </button>
  );
}
