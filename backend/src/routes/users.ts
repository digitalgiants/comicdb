import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { prisma } from "../prisma.js";

const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER")
});

const userUpdateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "USER"])
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", { preHandler: requireAdmin }, async () => {
    return prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
  });

  app.post("/users", { preHandler: requireAdmin }, async (request) => {
    const input = userCreateSchema.parse(request.body);
    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        passwordHash: input.password ? await bcrypt.hash(input.password, 12) : undefined
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
  });

  app.put("/users/:id", { preHandler: requireAdmin }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = userUpdateSchema.parse(request.body);
    return prisma.user.update({
      where: { id: params.id },
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {})
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
  });

  app.delete("/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    if (params.id === request.currentUser?.id) {
      return reply.code(400).send({ message: "You cannot delete your own signed-in account." });
    }
    await prisma.user.delete({ where: { id: params.id } });
    return { ok: true };
  });
}
