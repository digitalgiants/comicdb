import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "./types.js";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await request.jwtVerify<SessionUser>();
    request.currentUser = user;
  } catch {
    return reply.code(401).send({ message: "Please sign in to continue." });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.currentUser?.role !== "ADMIN") {
    return reply.code(403).send({ message: "Administrator access is required." });
  }
}

export function signSession(app: FastifyInstance, user: { id: string; email: string; name: string; role: "ADMIN" | "USER" }) {
  return app.jwt.sign({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  });
}
