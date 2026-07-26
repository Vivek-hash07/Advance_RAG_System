import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inngest must resolve to a single module instance. It identifies event
  // triggers with `instanceof`, so when the bundler gives the route handler a
  // different copy than the one our event definitions were built with, every
  // event-triggered function is rejected at sync time and silently never runs.
  serverExternalPackages: ["inngest"],
};

export default nextConfig;
