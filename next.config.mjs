import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    // Disable in dev to avoid HMR conflicts; service worker is built/registered only in production.
    disable: process.env.NODE_ENV === "development",
    cacheOnNavigation: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSerwist(nextConfig);
