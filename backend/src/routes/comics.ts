import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { searchComicVine } from "../services/comicVine.js";
import { estimateCurrentPrice } from "../services/ebay.js";

const comicSchema = z.object({
  title: z.string().min(1),
  writer: z.string().optional().nullable(),
  artist: z.string().optional().nullable(),
  penciler: z.string().optional().nullable(),
  inker: z.string().optional().nullable(),
  pricePaid: z.coerce.number().min(0).default(0),
  currentPrice: z.coerce.number().min(0).default(0),
  coverUrl: z.string().url().optional().nullable(),
  source: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable()
});

const comicImportSchema = z.object({
  title: z.string().min(1),
  writer: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  penciler: z.string().nullable().optional(),
  inker: z.string().nullable().optional(),
  pricePaid: z.coerce.number().min(0).default(0),
  currentPrice: z.coerce.number().min(0).default(0),
  coverUrl: z.string().url().nullable().optional(),
  source: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional()
});

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[\s_-]/g, "");
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

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalUrl(value: unknown) {
  const text = optionalText(value);
  if (!text) return null;
  try {
    new URL(text);
    return text;
  } catch {
    return null;
  }
}

function normalizeImportRow(raw: Record<string, unknown>) {
  return {
    title: optionalText(pickField(raw, ["title", "name", "book", "bookname"])) ?? "",
    writer: optionalText(pickField(raw, ["writer"])),
    artist: optionalText(pickField(raw, ["artist"])),
    penciler: optionalText(pickField(raw, ["penciler", "penciller"])),
    inker: optionalText(pickField(raw, ["inker"])),
    pricePaid: pickField(raw, ["pricepaid", "price_paid", "paid"]) ?? 0,
    currentPrice: pickField(raw, ["currentprice", "current_price", "value", "price"]) ?? 0,
    coverUrl: optionalUrl(pickField(raw, ["coverurl", "cover_url", "cover"])),
    source: optionalText(pickField(raw, ["source"])),
    sourceId: optionalText(pickField(raw, ["sourceid", "source_id"]))
  };
}

export async function comicRoutes(app: FastifyInstance) {
  app.get("/comics", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    return prisma.comic.findMany({
      where: {
        userId: request.currentUser!.id,
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { writer: { contains: query.q, mode: "insensitive" } },
                { artist: { contains: query.q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" }
    });
  });

  app.get("/comics/summary", { preHandler: requireAuth }, async (request) => {
    const result = await prisma.comic.aggregate({
      where: { userId: request.currentUser!.id },
      _count: true,
      _sum: { currentPrice: true, pricePaid: true }
    });

    return {
      count: result._count,
      currentValue: Number(result._sum.currentPrice ?? 0),
      paidValue: Number(result._sum.pricePaid ?? 0)
    };
  });

  app.post("/comics", { preHandler: requireAuth }, async (request) => {
    const input = comicSchema.parse(request.body);
    return prisma.comic.create({
      data: {
        userId: request.currentUser!.id,
        title: input.title,
        writer: input.writer,
        artist: input.artist,
        penciler: input.penciler,
        inker: input.inker,
        pricePaid: input.pricePaid,
        currentPrice: input.currentPrice,
        coverUrl: input.coverUrl,
        source: input.source,
        sourceId: input.sourceId
      }
    });
  });

  app.post("/comics/import", { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        comics: z.array(z.record(z.string(), z.unknown())).min(1).max(1000)
      })
      .parse(request.body);

    const errors: { row: number; message: string }[] = [];
    const valid: z.infer<typeof comicImportSchema>[] = [];

    body.comics.forEach((raw, index) => {
      const parsed = comicImportSchema.safeParse(normalizeImportRow(raw));
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid row.";
        errors.push({ row: index + 1, message });
        return;
      }
      valid.push(parsed.data);
    });

    if (!valid.length) {
      return reply.code(400).send({
        message: "No valid comics to import.",
        imported: 0,
        skipped: body.comics.length,
        errors
      });
    }

    await prisma.comic.createMany({
      data: valid.map((input) => ({
        userId: request.currentUser!.id,
        title: input.title,
        writer: input.writer,
        artist: input.artist,
        penciler: input.penciler,
        inker: input.inker,
        pricePaid: input.pricePaid,
        currentPrice: input.currentPrice,
        coverUrl: input.coverUrl,
        source: input.source,
        sourceId: input.sourceId
      }))
    });

    return {
      imported: valid.length,
      skipped: body.comics.length - valid.length,
      errors
    };
  });

  app.put("/comics/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = comicSchema.parse(request.body);
    const existing = await prisma.comic.findFirst({ where: { id: params.id, userId: request.currentUser!.id } });
    if (!existing) return reply.code(404).send({ message: "Comic was not found." });
    return prisma.comic.update({
      where: { id: params.id },
      data: input
    });
  });

  app.delete("/comics/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.comic.findFirst({ where: { id: params.id, userId: request.currentUser!.id } });
    if (!existing) return reply.code(404).send({ message: "Comic was not found." });
    await prisma.comic.delete({ where: { id: params.id } });
    return { ok: true };
  });

  app.get("/search/comics", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ q: z.string().min(2) }).parse(request.query);
    const results = await searchComicVine(query.q);
    return results;
  });

  app.get("/search/price", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ title: z.string().min(2) }).parse(request.query);
    const price = await estimateCurrentPrice(query.title);
    return { price };
  });
}
