import { z } from "zod";

export const COMIC_IMPORT_HEADERS = [
  "name",
  "number",
  "Date",
  "Volume",
  "direct",
  "Publisher",
  "no. of books",
  "print",
  "print ratio",
  "Cover",
  "variant",
  "writer",
  "artist",
  "Pencils",
  "inker",
  "cover artist",
  "average price",
  "price paid",
  "buy date",
  "sell date",
  "point of purchase",
  "signed",
  "remarked",
  "notes"
] as const;

const importAliases: Record<string, string[]> = {
  name: ["name"],
  number: ["number"],
  date: ["date", "Date"],
  volume: ["volume", "Volume"],
  direct: ["direct"],
  publisher: ["publisher", "Publisher"],
  numberOfBooks: ["no. of books", "no of books"],
  print: ["print"],
  printRatio: ["print ratio"],
  cover: ["cover", "Cover"],
  variant: ["variant"],
  writer: ["writer"],
  artist: ["artist"],
  pencils: ["pencils", "Pencils"],
  inker: ["inker"],
  coverArtist: ["cover artist"],
  averagePrice: ["average price"],
  pricePaid: ["price paid"],
  buyDate: ["buy date"],
  sellDate: ["sell date"],
  pointOfPurchase: ["point of purchase"],
  signed: ["signed"],
  remarked: ["remarked"],
  notes: ["notes"]
};

const optionalDecimal = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}, z.number().min(0).nullable());

const optionalUrl = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  try {
    new URL(text);
    return text;
  } catch {
    return null;
  }
}, z.string().url().nullable());

export const comicFieldSchema = z.object({
  name: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  direct: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  numberOfBooks: z.string().nullable().optional(),
  print: z.string().nullable().optional(),
  printRatio: z.string().nullable().optional(),
  cover: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  writer: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  pencils: z.string().nullable().optional(),
  inker: z.string().nullable().optional(),
  coverArtist: z.string().nullable().optional(),
  coverImageUrl: optionalUrl.optional(),
  averagePrice: optionalDecimal.optional(),
  pricePaid: optionalDecimal.optional(),
  buyDate: z.string().nullable().optional(),
  sellDate: z.string().nullable().optional(),
  pointOfPurchase: z.string().nullable().optional(),
  signed: z.string().nullable().optional(),
  remarked: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export type ComicFields = z.infer<typeof comicFieldSchema>;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function pickField(raw: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const match = Object.keys(raw).find((key) => normalizeKey(key) === normalizeKey(alias));
    if (!match) continue;
    const value = raw[match];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

export function normalizeImportRow(raw: Record<string, unknown>): ComicFields {
  const row: Record<string, unknown> = {};
  for (const [field, aliases] of Object.entries(importAliases)) {
    row[field] = pickField(raw, aliases);
  }
  return comicFieldSchema.parse(row);
}

export function hasComicData(row: ComicFields) {
  return Object.values(row).some((value) => value !== null && value !== undefined && value !== "");
}

export type ComicPriceLabelInput = {
  name?: string | null;
  number?: string | null;
  volume?: string | null;
  publisher?: string | null;
};

export function comicPriceSearchLabel(comic: ComicPriceLabelInput) {
  const issue = comic.number ? `#${comic.number}` : "";
  return [comic.name, issue, comic.volume, comic.publisher].filter(Boolean).join(" ").trim();
}

export function comicDataFromFields(input: ComicFields) {
  return {
    name: input.name,
    number: input.number,
    date: input.date,
    volume: input.volume,
    direct: input.direct,
    publisher: input.publisher,
    numberOfBooks: input.numberOfBooks,
    print: input.print,
    printRatio: input.printRatio,
    cover: input.cover,
    variant: input.variant,
    writer: input.writer,
    artist: input.artist,
    pencils: input.pencils,
    inker: input.inker,
    coverArtist: input.coverArtist,
    coverImageUrl: input.coverImageUrl,
    averagePrice: input.averagePrice,
    pricePaid: input.pricePaid,
    buyDate: input.buyDate,
    sellDate: input.sellDate,
    pointOfPurchase: input.pointOfPurchase,
    signed: input.signed,
    remarked: input.remarked,
    notes: input.notes
  };
}
