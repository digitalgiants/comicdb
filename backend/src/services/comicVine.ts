import { env } from "../env.js";

type ComicVineVolume = { name?: string; publisher?: { name?: string } } | string;

type ComicVineResult = {
  id: number;
  name?: string;
  volume?: ComicVineVolume;
  issue_number?: string;
  cover_date?: string;
  image?: {
    original_url?: string;
    super_url?: string;
    medium_url?: string;
    small_url?: string;
    icon_url?: string;
  };
  person_credits?: Array<{ name?: string; role?: string }> | null;
};

export type ComicSearchResult = {
  source: "comicvine";
  sourceId: string;
  displayTitle: string;
  coverImageUrl?: string;
  name?: string;
  number?: string;
  date?: string;
  volume?: string;
  publisher?: string;
  writer?: string;
  artist?: string;
  pencils?: string;
  inker?: string;
  coverArtist?: string;
};

function volumeName(volume: ComicVineVolume | undefined) {
  if (!volume) return undefined;
  return typeof volume === "string" ? volume : volume.name;
}

function volumePublisher(volume: ComicVineVolume | undefined) {
  if (!volume || typeof volume === "string") return undefined;
  return volume.publisher?.name;
}

function coverImageUrl(image: ComicVineResult["image"]) {
  return (
    image?.original_url ??
    image?.super_url ??
    image?.medium_url ??
    image?.small_url ??
    image?.icon_url ??
    undefined
  );
}

function namesByRole(credits: ComicVineResult["person_credits"], roleName: string) {
  if (!Array.isArray(credits)) return undefined;
  return credits
    .filter((credit) => credit.role?.toLowerCase().includes(roleName))
    .map((credit) => credit.name)
    .filter(Boolean)
    .join(", ") || undefined;
}

function mapComicVineResult(comic: ComicVineResult): ComicSearchResult | null {
  try {
    const series = volumeName(comic.volume) ?? comic.name ?? "Untitled comic";
    const issue = comic.issue_number ? ` #${comic.issue_number}` : "";
    const year = comic.cover_date ? ` (${String(comic.cover_date).slice(0, 4)})` : "";
    return {
      source: "comicvine",
      sourceId: String(comic.id),
      displayTitle: `${series}${issue}${year}`,
      coverImageUrl: coverImageUrl(comic.image),
      name: series,
      number: comic.issue_number,
      date: comic.cover_date ?? undefined,
      volume: volumeName(comic.volume),
      publisher: volumePublisher(comic.volume),
      writer: namesByRole(comic.person_credits, "writer"),
      artist: namesByRole(comic.person_credits, "artist"),
      pencils: namesByRole(comic.person_credits, "penciler"),
      inker: namesByRole(comic.person_credits, "inker"),
      coverArtist: namesByRole(comic.person_credits, "cover")
    };
  } catch {
    return null;
  }
}

function parseComicVinePayload(data: unknown): ComicVineResult[] {
  if (!data || typeof data !== "object") return [];
  const payload = data as { status_code?: number; results?: unknown; error?: string };
  if (payload.status_code != null && payload.status_code !== 1) return [];
  if (!Array.isArray(payload.results)) return [];
  return payload.results as ComicVineResult[];
}

export async function searchComicVine(query: string): Promise<ComicSearchResult[]> {
  if (!env.comicVineApiKey) return [];

  const params = new URLSearchParams({
    api_key: env.comicVineApiKey,
    format: "json",
    resources: "issue",
    query,
    limit: "12",
    field_list: "id,name,volume,issue_number,cover_date,image,person_credits"
  });

  try {
    const response = await fetch(`https://comicvine.gamespot.com/api/search/?${params}`, {
      headers: {
        "User-Agent": "ComicVault/0.1 (+https://vault.andrewseifert.com)"
      }
    });

    if (!response.ok) return [];

    const data = (await response.json()) as unknown;
    return parseComicVinePayload(data)
      .map(mapComicVineResult)
      .filter((result): result is ComicSearchResult => result != null);
  } catch {
    return [];
  }
}

export async function findComicVineCover(query: string): Promise<string | null> {
  const [first] = await searchComicVine(query);
  return first?.coverImageUrl ?? null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findComicVineCoverWithDelay(query: string, waitMs = 1200) {
  const cover = await findComicVineCover(query);
  await delay(waitMs);
  return cover;
}
