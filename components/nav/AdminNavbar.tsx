import Image from "next/image";
import Link from "next/link";

export default function AdminNavbar({ role }: { role?: string | null }) {
  return (
    <nav className="fixed top-0 inset-x-0 z-[5000] theme-lock pointer-events-auto yb-navbar yb-navbar-bordered">
      <div className="relative w-full px-5 sm:px-6 md:px-8 lg:px-10 xl:px-14 flex items-center h-20 gap-6">
        <Link href="/admin" aria-label="Go to admin dashboard" className="touch-manipulation">
          <span className="relative block h-10 w-10 md:hidden">
            <Image
              src="/business-placeholder2.png"
              alt="YourBarrio"
              fill
              sizes="40px"
              priority
              className="object-contain"
            />
          </span>
          <span className="relative hidden h-10 w-10 md:block md:h-32 md:w-32">
            <Image
              src="/logo.png"
              alt="YourBarrio"
              fill
              sizes="128px"
              priority
              className="object-contain"
            />
          </span>
        </Link>

        <p className="absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 md:ml-auto text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-white/80 whitespace-nowrap">
          ADMIN ACCOUNT{role ? ` • ${role}` : ""}
        </p>
      </div>
    </nav>
  );
}
