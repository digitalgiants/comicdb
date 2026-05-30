import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import "./types.js";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { comicRoutes } from "./routes/comics.js";
import { userRoutes } from "./routes/users.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.frontendOrigin,
  credentials: true
});

await app.register(jwt, {
  secret: env.jwtSecret
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: "Please check the form fields.", issues: error.issues });
  }
  app.log.error(error);
  return reply.code(500).send({ message: "Something went wrong." });
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(comicRoutes);
await app.register(userRoutes);

await app.listen({ port: env.port, host: "0.0.0.0" });
