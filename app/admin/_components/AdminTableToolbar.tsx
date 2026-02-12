import type { ReactNode } from "react";

type AdminTableToolbarProps = {
  left: ReactNode;
  right?: ReactNode;
};

export default function AdminTableToolbar({ left, right }: AdminTableToolbarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}
