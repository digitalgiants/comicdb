export const env = {
  port: Number(process.env.PORT ?? 8084),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:8090",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:8084/auth/google/callback",
  comicVineApiKey: process.env.COMICVINE_API_KEY ?? "",
  ebayClientId: process.env.EBAY_CLIENT_ID ?? "",
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
  ebayMarketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
};
