"use client";

import Link from "next/link";
import HomeSectionContainer from "@/components/home/HomeSectionContainer";

export function SellerCTASection() {
  return (
    <section className="mt-10 md:mt-12">
      <HomeSectionContainer>
        <div className="overflow-hidden rounded-2xl border border-[#efe3c433] bg-[linear-gradient(135deg,rgba(249,241,224,0.98)_0%,rgba(244,231,211,0.94)_48%,rgba(236,217,192,0.96)_100%)] px-6 py-8 shadow-[0_28px_90px_-56px_rgba(233,185,92,0.58)] sm:px-10 sm:py-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7f4f10]">
              For sellers
            </p>
            <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.05em] text-[#20140a] sm:text-[2.35rem]">
              Own a local business?
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-[#5f4527] sm:text-base">
              Start selling on YourBarrio and reach local customers through a marketplace built for neighborhood commerce.
            </p>
            <div className="mt-5">
              <Link
                href="/business-auth/register"
                prefetch={false}
                className="inline-flex items-center justify-center rounded-full bg-[#20140a] px-6 py-2.5 text-sm font-semibold text-[#fff7ea] transition hover:bg-[#120b05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7f4f10] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4e7d3]"
              >
                Start selling on YourBarrio
              </Link>
            </div>
          </div>
        </div>
      </HomeSectionContainer>
    </section>
  );
}
