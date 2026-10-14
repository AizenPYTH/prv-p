import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Amaz est un site statique copié tel quel dans public/amaz : ces réécritures
  // servent ses pages aux URLs propres (/amaz, /amaz/paiements).
  async rewrites() {
    return [
      { source: "/amaz", destination: "/amaz/index.html" },
      { source: "/amaz/paiements", destination: "/amaz/paiements.html" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
