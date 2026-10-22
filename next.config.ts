import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Painel e login não podem ser embutidos em iframe de outro site
        // (clickjacking nos botões de credencial e no formulário de setup).
        // /api e /track.js ficam de fora: são consumidos por outros domínios.
        source: "/((?!api/|track\\.js).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
