import { env } from "../env.js";

type ComicVineVolume = { name?: string; publisher?: { name?: string } } | string;

type ComicVineImage = {
  original_url?: string;
  super_url?: string;
  medium_url?: string;
  small_url?: string;
  icon_url?: string;
};

type ComicVineResult = {
  id: number;
  name?: string;
  volume?: ComicVineVolume;
  issue_number?: string;
  cover_date?: string;
  image?: ComicVineImage | Record<string, never>;
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

const COMIC_VINE_BASE = "https://comicvine.gamespot.com/api";
const COMIC_VINE_HEADERS = {
  "User-Agent": "ComicVault/0.1 (+https://vault.andrewseifert.com)"
};

function volumeName(volume: ComicVineVolume | undefined) {
  if (!volume) return undefined;
  return typeof volume === "string" ? volume : volume.name;
}

function volumePublisher(volume: ComicVineVolume | undefined) {
  if (!volume || typeof volume === "string") return undefined;
  return volume.publisher?.name;
}

function coverImageUrl(image: ComicVineImage | Record<string, never> | undefined) {
  if (!image || !Object.keys(image).length) return undefined;
  return (
    image.original_url ??
    image.super_url ??
    image.medium_url ??
    image.small_url ??
    image.icon_url ??
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

function parseComicVineListPayload(data: unknown): ComicVineResult[] {
  if (!data || typeof data !== "object") return [];
  const payload = data as { status_code?: number; results?: unknown; error?: string };
  if (payload.status_code != null && payload.status_code !== 1) return [];
  if (!Array.isArray(payload.results)) return [];
  return payload.results as ComicVineResult[];
}

function parseComicVineDetailPayload(data: unknown): ComicVineResult | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { status_code?: number; results?: unknown; error?: string };
  if (payload.status_code != null && payload.status_code !== 1) return null;
  if (!payload.results || typeof payload.results !== "object") return null;
  return payload.results as ComicVineResult;
}

async function comicVineRequest(path: string, params: Record<string, string>) {
  if (!env.comicVineApiKey) return null;

  const query = new URLSearchParams({
    api_key: env.comicVineApiKey,
    format: "json",
    ...params
  });

  try {
    const response = await fetch(`${COMIC_VINE_BASE}${path}?${query}`, {
      headers: COMIC_VINE_HEADERS
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function fetchComicVineIssue(issueId: string): Promise<ComicVineResult | null> {
  const data = await comicVineRequest(`/issue/4000-${issueId}/`, {
    field_list: "id,name,volume,issue_number,cover_date,image,person_credits"
  });
  return parseComicVineDetailPayload(data);
}

export async function fetchComicVineIssueImage(issueId: string): Promise<string | null> {
  const issue = await fetchComicVineIssue(issueId);
  return coverImageUrl(issue?.image) ?? null;
}

export async function searchComicVine(query: string): Promise<ComicSearchResult[]> {
  const data = await comicVineRequest("/search/", {
    resources: "issue",
    query,
    limit: "12",
    field_list: "id,name,volume,issue_number,cover_date,image,person_credits"
  });
  if (!data) return [];

  const results = parseComicVineListPayload(data)
    .map(mapComicVineResult)
    .filter((result): result is ComicSearchResult => result != null);

  // Search often returns an empty image object; load the issue detail for a reliable cover URL.
  return Promise.all(
    results.map(async (result) => {
      if (result.coverImageUrl) return result;
      const imageUrl = await fetchComicVineIssueImage(result.sourceId);
      return imageUrl ? { ...result, coverImageUrl: imageUrl } : result;
    })
  );
}

export async function findComicVineCover(query: string): Promise<string | null> {
  const data = await comicVineRequest("/search/", {
    resources: "issue",
    query,
    limit: "1",
    field_list: "id,image"
  });
  if (!data) return null;

  const [match] = parseComicVineListPayload(data);
  if (!match) return null;

  const searchImage = coverImageUrl(match.image);
  if (searchImage) return searchImage;

  return fetchComicVineIssueImage(String(match.id));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findComicVineCoverWithDelay(query: string, waitMs = 1200) {
  const cover = await findComicVineCover(query);
  await delay(waitMs);
  return cover;
}
