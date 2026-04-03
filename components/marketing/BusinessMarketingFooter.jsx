import Link from "next/link";

export default function BusinessMarketingFooter() {
  return (
    <footer className="theme-lock border-t border-white/10 bg-[#05010d] py-12 text-white">
      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 text-white/80 md:grid-cols-[1.15fr_0.8fr_0.8fr] md:gap-12">
          <div className="max-w-sm">
            <Link href="/" className="text-xl font-bold text-white transition-colors duration-200 hover:text-white/90">
              YourBarrio
            </Link>
            <p className="mt-3 max-w-[19rem] text-sm leading-6 text-white/70">
              Grow your local presence with tools built for small businesses.
            </p>
            <p className="mt-3 max-w-[19rem] text-sm leading-6 text-white/55">
              Helping local businesses grow where they matter most.
            </p>
            <div className="mt-5">
              <Link href="/business" prefetch={false} className="transition-colors duration-200 hover:text-white">
                YourBarrio for Business
              </Link>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-white">Navigation</h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/about" className="transition-colors duration-200 hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors duration-200 hover:text-white">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors duration-200 hover:text-white">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-white">Contact</h4>
            <ul className="mt-4 space-y-2.5 text-white/70">
              <li>support@yourbarrio.com</li>
              <li>Long Beach, CA</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/8 pt-6 text-center text-sm text-white/50">
          © {new Date().getFullYear()} YourBarrio — All rights reserved.
        </div>
      </div>
    </footer>
  );
}
