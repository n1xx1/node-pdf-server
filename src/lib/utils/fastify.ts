import { FastifyInstance } from "fastify";

export type inferFastifyRequest<T extends FastifyInstance> = Parameters<
  Parameters<T["route"]>[0]["handler"]
>[0];
