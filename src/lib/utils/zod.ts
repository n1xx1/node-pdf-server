import { z } from "zod";

export const schemaJson = z.string().transform((val, ctx) => {
  try {
    return JSON.parse(val);
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "not a json value",
    });
    return z.NEVER;
  }
});

export function makeNullish<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((x) => x ?? undefined);
}
