/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  // Disable the experimental React Compiler in prod; it can interfere with event handling
  // on some builds. Flip on locally by setting NEXT_PUBLIC_REACT_COMPILER=true if needed.
  reactCompiler: process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_REACT_COMPILER !== "false",
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 82],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "crskbfbleiubpkvyvvlf.supabase.co", 
      },
      {
        protocol: "https",
        hostname: "nbzqnjanqkzuwyxnkjtr.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/business-placeholder.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/customer-placeholder.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/listing-placeholder.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/logo.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
