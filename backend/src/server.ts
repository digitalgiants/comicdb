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

function errorStatusCode(error: unknown) {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") return statusCode;
  }
  return 500;
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: "Please check the form fields.", issues: error.issues });
  }
  app.log.error(error);

  const statusCode = errorStatusCode(error);
  const message = error instanceof Error ? error.message : "Something went wrong.";

  if (message.includes("coverImageUrl") || message.includes("does not exist")) {
    return reply.code(500).send({
      message: "Database schema is out of date. Redeploy the backend so migrations can run."
    });
  }

  return reply.code(statusCode).send({
    message: statusCode >= 500 ? "Something went wrong." : message
  });
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(comicRoutes);
await app.register(userRoutes);

await app.listen({ port: env.port, host: "0.0.0.0" });
