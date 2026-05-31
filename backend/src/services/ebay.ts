import { env } from "../env.js";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getEbayToken() {
  if (!env.ebayClientId || !env.ebayClientSecret) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const credentials = Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope"
  });

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return tokenCache.token;
}

export async function estimateAveragePrice(label: string) {
  const token = await getEbayToken();
  if (!token) return null;

  const params = new URLSearchParams({
    q: `${label} comic book`,
    limit: "20",
    filter: "buyingOptions:{FIXED_PRICE}"
  });

  const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": env.ebayMarketplaceId
    }
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { itemSummaries?: Array<{ price?: { value?: string } }> };
  const prices = (data.itemSummaries ?? [])
    .map((item) => Number(item.price?.value))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!prices.length) return null;
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return Number(average.toFixed(2));
}
