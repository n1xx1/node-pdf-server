import * as multipart from "@fastify/multipart";
import * as bearerAuth from "@fastify/bearer-auth";
import Fastify from "fastify";
import { PDFOptions } from "puppeteer";
import { z } from "zod";
import {
  exportPdfFromHtml,
  manipulatePdf,
  mergePdfs,
  overlayPdfs,
  schemaPdfFormat,
  schemaPdfNumber,
} from "./lib/pdf";
import { asyncIterToArray } from "./lib/utils/async";
import { inferFastifyRequest } from "./lib/utils/fastify";
import { makeNullish, schemaJson } from "./lib/utils/zod";
import { env } from "./env";

const app = Fastify({
  logger: true,
});

app.register(async (app) => {
  app.get("/", async (req, resp) => {
    return { status: "ok" };
  });
});

const MB = 1024 * 1024;

app.register(async (app) => {
  app.register(multipart, {
    limits: {
      fileSize: 50 * MB,
    },
  });

  if (env.ACCESS_TOKEN) {
    const keysArray = env.ACCESS_TOKEN.split(",").map((s) => s.trim());
    const keys = new Set(keysArray);
    app.register(bearerAuth, { keys });
  } else {
    app.log.warn("missing ACCESS_TOKEN env variable, this is a bad idea!");
  }

  class HttpError extends Error {
    statusCode: number;
    constructor(status: number, err: Error | string) {
      super(err instanceof Error ? err.message : err);
      this.statusCode = status;
    }
  }

  app.post("/pdf-overlay", async (req, resp) => {
    if (!req.isMultipart()) {
      throw new HttpError(400, "multipart expected");
    }

    const formData = await loadMultipartData(req);
    const form = z
      .object({
        main: schemaIsMultipartFile,
        over: schemaIsMultipartFile
          .or(z.array(schemaIsMultipartFile))
          .transform((x) => (Array.isArray(x) ? x : [x])),
        config: z.nullable(
          z.optional(
            schemaIsMultipartValue
              .transform((v) => v.value)
              .pipe(schemaJson.pipe(schemaManipulate))
          )
        ),
      })
      .parse(formData);

    let data = await overlayPdfs(
      await form.main.toBuffer(),
      await Promise.all(form.over.map((x) => x.toBuffer()))
    );

    if (form.config) {
      data = await manipulatePdf(data, form.config);
    }

    return resp
      .header("Content-Type", "application/pdf")
      .send(Buffer.from(data));
  });

  app.post("/pdf-manipulate", async (req, resp) => {
    if (!req.isMultipart()) {
      throw new HttpError(400, "multipart expected");
    }

    const form = z
      .object({
        file: schemaIsMultipartFile,
        config: schemaIsMultipartValue
          .transform((v) => v?.value)
          .pipe(schemaJson.pipe(schemaManipulate)),
      })
      .parse(await loadMultipartData(req));

    const input = await form.file.toBuffer();
    const data = await manipulatePdf(input, form.config);
    return resp
      .header("Content-Type", "application/pdf")
      .send(Buffer.from(data));
  });

  app.post("/pdf-merge", async (req, resp) => {
    const form = z
      .object({
        file: schemaIsMultipartFile
          .or(z.array(schemaIsMultipartFile))
          .transform((x) => (Array.isArray(x) ? x : [x])),
        config: z.nullable(
          z.optional(
            schemaIsMultipartValue
              .transform((v) => v.value)
              .pipe(schemaJson.pipe(schemaManipulate))
          )
        ),
      })
      .parse(await loadMultipartData(req));

    let data = await mergePdfs(
      await Promise.all(form.file.map((f) => f.toBuffer()))
    );
    if (form.config) {
      data = await manipulatePdf(data, form.config);
    }
    return resp
      .header("Content-Type", "application/pdf")
      .send(Buffer.from(data));
  });

  app.post("/pdf-from-html", async (req, resp) => {
    const request = z
      .intersection(
        z.object({
          content: z.string(),
          margins: z
            .object({
              bottom: schemaPdfNumber.nullish().transform((x) => x ?? "10mm"),
              top: schemaPdfNumber.nullish().transform((x) => x ?? "10mm"),
              left: schemaPdfNumber.nullish().transform((x) => x ?? "10mm"),
              right: schemaPdfNumber.nullish().transform((x) => x ?? "10mm"),
            })
            .nullish(),
          header: z.string().nullish(),
          footer: z.string().nullish(),
          landscape: z.boolean().nullish(),
          manipulate: schemaManipulate.nullish(),
          scale: z.number().min(0.2).max(2).nullish(),
        }),
        z.union([
          z.object({
            format: schemaPdfFormat,
          }),
          z.object({
            width: z.number(),
            height: z.number(),
          }),
        ])
      )
      .parse(req.body);

    const options: PDFOptions = {};
    if ("format" in request) {
      options.format = request.format;
    } else {
      options.width = request.width;
      options.height = request.height;
    }

    if (request.header || request.footer) {
      options.displayHeaderFooter = true;
      options.headerTemplate = request.header ?? " ";
      options.footerTemplate = request.footer ?? " ";
    }

    options.landscape = request.landscape ?? false;
    options.printBackground = true;
    options.scale = request.scale ?? 1;
    if (request.margins) {
      options.margin = request.margins;
    }

    let data = await exportPdfFromHtml(request.content, options);

    if (request.manipulate) {
      data = await manipulatePdf(data, request.manipulate);
    }

    return resp
      .header("Content-Type", "application/pdf")
      .send(Buffer.from(data));
  });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
});

const schemaIsMultipartValue = z.custom<multipart.MultipartValue>(
  (v) => typeof v === "object" && v && "type" in v && v.type === "field"
);

const schemaIsMultipartFile = z.custom<multipart.MultipartFile>(
  (v) => typeof v === "object" && v && "type" in v && v.type === "file"
);

async function loadMultipartData(
  req: inferFastifyRequest<typeof app>
): Promise<multipart.MultipartFields> {
  const out: multipart.MultipartFields = {};

  const parts = await asyncIterToArray(req.parts());

  for (const part of parts) {
    const old = out[part.fieldname];
    if (!old) {
      out[part.fieldname] = part;
      continue;
    }
    if (Array.isArray(old)) {
      old.push(part);
      continue;
    }
    out[part.fieldname] = [old, part];
  }
  return out;
}

const schemaManipulate = z.object({
  title: makeNullish(z.string()),
  author: makeNullish(z.string()),
  subject: makeNullish(z.string()),
  keywords: makeNullish(z.array(z.string())),
  creator: makeNullish(z.string()),
  producer: makeNullish(z.string()),
  language: makeNullish(z.string()),
  creationDate: makeNullish(z.date()),
  modificationDate: makeNullish(z.date()),
});
