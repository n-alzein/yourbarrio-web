import type { ReactNode } from "react";

export default function StatusStack({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!items.length) return null;
  return <div className="space-y-2">{items}</div>;
}
