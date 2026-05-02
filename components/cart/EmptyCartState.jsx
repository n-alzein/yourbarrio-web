import Link from "next/link";

export default function EmptyCartState() {
  return (
    <div
      className="px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-8 lg:px-12"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex min-h-[calc(100vh-20rem)] items-start justify-center pt-2 md:pt-3">
          <section
            className="w-full max-w-[640px] rounded-[32px] px-6 py-7 text-center md:px-8 md:py-8"
            style={{
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 20px 44px -38px rgba(15,23,42,0.16)",
            }}
          >
            <div className="mx-auto max-w-[460px]">
              <h1 className="text-[1.78rem] font-semibold tracking-[-0.04em] text-slate-950 md:text-[2.1rem]">
                Your cart is empty
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500 md:text-[15px]">
                Add an item from a local listing to start an order.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <Link
                  href="/listings"
                  className="yb-cart-empty-cta inline-flex min-h-10 items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition focus-visible:ring-offset-2"
                >
                  Browse local listings
                </Link>
                <Link
                  href="/customer/nearby"
                  className="text-[13px] font-medium text-slate-400 transition hover:text-violet-700 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                >
                  Explore nearby shops
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
