/** @type {import('next').NextConfig} */
// O navegador só fala com o próprio domínio do Vercel; /api/* é repassado ao Railway.
// Assim o cookie de sessão é "first-party" (sem problemas de SameSite/CORS).
const API_URL = process.env.API_URL || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
