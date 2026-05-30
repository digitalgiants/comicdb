import { env } from "../env.js";

type ComicVineResult = {
  id: number;
  name?: string;
  volume?: { name?: string };
  issue_number?: string;
  cover_date?: string;
  image?: { original_url?: string; small_url?: string };
  person_credits?: Array<{ name?: string; role?: string }>;
};

export type ComicSearchResult = {
  source: "comicvine";
  sourceId: string;
  title: string;
  writer?: string;
  artist?: string;
  penciler?: string;
  inker?: string;
  coverUrl?: string;
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
      title: `${baseTitle}${issue}${year}`,
      writer: namesByRole(comic.person_credits, "writer"),
      artist: namesByRole(comic.person_credits, "artist"),
      penciler: namesByRole(comic.person_credits, "penciler"),
      inker: namesByRole(comic.person_credits, "inker"),
      coverUrl: comic.image?.original_url ?? comic.image?.small_url
    };
  });
}
