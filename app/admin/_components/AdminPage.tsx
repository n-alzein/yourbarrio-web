import type { ReactNode } from "react";

type AdminPageProps = {
  children: ReactNode;
  className?: string;
};

export default function AdminPage({ children, className = "" }: AdminPageProps) {
  const base = "min-h-screen space-y-8 bg-neutral-950 text-neutral-100";
  const classes = className.trim() ? `${base} ${className}` : base;
  return <section className={classes}>{children}</section>;
}
