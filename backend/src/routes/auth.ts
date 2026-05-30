import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signSession } from "../auth.js";
import { env } from "../env.js";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) return reply.code(409).send({ message: "An account already exists for that email." });

    const userCount = await prisma.user.count();
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await bcrypt.hash(input.password, 12),
        role: userCount === 0 ? "ADMIN" : "USER"
      }
    });

    return { token: signSession(app, user), user };
  });

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return reply.code(401).send({ message: "Email or password is incorrect." });
    }
    return { token: signSession(app, user), user };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    return { user: request.currentUser };
  });

  if (env.googleClientId && env.googleClientSecret) {
    await app.register(import("@fastify/oauth2"), {
      name: "googleOAuth2",
      scope: ["profile", "email"],
      credentials: {
        client: {
          id: env.googleClientId,
          secret: env.googleClientSecret
        },
        auth: {
          authorizeHost: "https://accounts.google.com",
          authorizePath: "/o/oauth2/v2/auth",
          tokenHost: "https://oauth2.googleapis.com",
          tokenPath: "/token"
        }
      },
      startRedirectPath: "/auth/google",
      callbackUri: env.googleCallbackUrl
    });

    app.get("/auth/google/callback", async function (request, reply) {
      const token = await (this as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.token.access_token}` }
      });
      const profile = (await response.json()) as { id: string; email: string; name?: string };
      const userCount = await prisma.user.count();
      const user = await prisma.user.upsert({
        where: { email: profile.email.toLowerCase() },
        update: { googleId: profile.id, name: profile.name ?? profile.email },
        create: {
          email: profile.email.toLowerCase(),
          name: profile.name ?? profile.email,
          googleId: profile.id,
          role: userCount === 0 ? "ADMIN" : "USER"
        }
      });
      const appToken = signSession(app, user);
      return reply.redirect(`${env.frontendOrigin}/oauth?token=${encodeURIComponent(appToken)}`);
    });
  }
}
