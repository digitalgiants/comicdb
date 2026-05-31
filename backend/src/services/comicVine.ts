import { env } from "../env.js";

type ComicVineResult = {
  id: number;
  name?: string;
  volume?: { name?: string; publisher?: { name?: string } };
  issue_number?: string;
  cover_date?: string;
  image?: { original_url?: string; small_url?: string };
  person_credits?: Array<{ name?: string; role?: string }>;
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

function namesByRole(credits: ComicVineResult["person_credits"], roleName: string) {
  return credits
    ?.filter((credit) => credit.role?.toLowerCase().includes(roleName))
    .map((credit) => credit.name)
    .filter(Boolean)
    .join(", ");
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

  const response = await fetch(`https://comicvine.gamespot.com/api/search/?${params}`, {
    headers: {
      "User-Agent": "ComicVault/0.1"
    }
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { results?: ComicVineResult[] };

  return (data.results ?? []).map((comic) => {
    const baseTitle = comic.volume?.name ?? comic.name ?? "Untitled comic";
    const issue = comic.issue_number ? ` #${comic.issue_number}` : "";
    const year = comic.cover_date ? ` (${comic.cover_date.slice(0, 4)})` : "";
    return {
      source: "comicvine",
      sourceId: String(comic.id),
      displayTitle: `${baseTitle}${issue}${year}`,
      coverImageUrl: comic.image?.original_url ?? comic.image?.small_url,
      name: comic.volume?.name ?? comic.name,
      number: comic.issue_number,
      date: comic.cover_date ?? undefined,
      volume: comic.volume?.name,
      publisher: comic.volume?.publisher?.name,
      writer: namesByRole(comic.person_credits, "writer"),
      artist: namesByRole(comic.person_credits, "artist"),
      pencils: namesByRole(comic.person_credits, "penciler"),
      inker: namesByRole(comic.person_credits, "inker"),
      coverArtist: namesByRole(comic.person_credits, "cover")
    };
  });
}

export async function findComicVineCover(query: string): Promise<string | null> {
  const [first] = await searchComicVine(query);
  return first?.coverImageUrl ?? null;
}
