import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  comicDataFromFields,
  comicFieldSchema,
  comicPriceSearchLabel,
  hasComicData,
  normalizeImportRow,
  type ComicFields
} from "../comicFields.js";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { searchComicVine } from "../services/comicVine.js";
import { estimateAveragePrice } from "../services/ebay.js";

const searchFields = [
  "name",
  "number",
  "volume",
  "publisher",
  "writer",
  "artist",
  "pencils",
  "inker",
  "coverArtist",
  "notes"
] as const;

async function resolveAveragePrice(input: ComicFields) {
  if (input.averagePrice != null) return input.averagePrice;
  const label = comicPriceSearchLabel(input);
  if (!label) return null;
  return estimateAveragePrice(label);
}

export async function comicRoutes(app: FastifyInstance) {
  app.get("/comics", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    return prisma.comic.findMany({
      where: {
        userId: request.currentUser!.id,
        ...(query.q
          ? {
              OR: searchFields.map((field) => ({
                [field]: { contains: query.q, mode: "insensitive" as const }
              }))
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
      _sum: { averagePrice: true, pricePaid: true }
    });

    return {
      count: result._count,
      averageValue: Number(result._sum.averagePrice ?? 0),
      paidValue: Number(result._sum.pricePaid ?? 0)
    };
  });

  app.post("/comics", { preHandler: requireAuth }, async (request) => {
    const input = comicFieldSchema.parse(request.body);
    const averagePrice = await resolveAveragePrice(input);
    return prisma.comic.create({
      data: {
        userId: request.currentUser!.id,
        ...comicDataFromFields({ ...input, averagePrice })
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
    const valid: ComicFields[] = [];

    for (const [index, raw] of body.comics.entries()) {
      try {
        const row = normalizeImportRow(raw);
        if (!hasComicData(row)) {
          errors.push({ row: index + 1, message: "Row is empty." });
          continue;
        }
        valid.push(row);
      } catch (error) {
        const message = error instanceof z.ZodError ? (error.issues[0]?.message ?? "Invalid row.") : "Invalid row.";
        errors.push({ row: index + 1, message });
      }
    }

    if (!valid.length) {
      return reply.code(400).send({
        message: "No valid comics to import.",
        imported: 0,
        skipped: body.comics.length,
        errors
      });
    }

    const records = await Promise.all(
      valid.map(async (input) => ({
        userId: request.currentUser!.id,
        ...comicDataFromFields({
          ...input,
          averagePrice: await resolveAveragePrice(input)
        })
      }))
    );

    await prisma.comic.createMany({ data: records });

    return {
      imported: valid.length,
      skipped: body.comics.length - valid.length,
      errors
    };
  });

  app.put("/comics/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = comicFieldSchema.parse(request.body);
    const existing = await prisma.comic.findFirst({ where: { id: params.id, userId: request.currentUser!.id } });
    if (!existing) return reply.code(404).send({ message: "Comic was not found." });

    return prisma.comic.update({
      where: { id: params.id },
      data: comicDataFromFields(input)
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
    return searchComicVine(query.q);
  });

  app.get("/search/price", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ q: z.string().min(2) }).parse(request.query);
    const price = await estimateAveragePrice(query.q);
    return { price };
  });
}
