import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().default(3000),
    ACCESS_TOKEN: z
      .string()
      .min(8)
      .nullish()
      .transform((v) => v ?? null),
  })
  .parse(process.env);
