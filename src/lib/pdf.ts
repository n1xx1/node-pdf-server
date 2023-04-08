import puppeteer, { PDFOptions } from "puppeteer";
import { z } from "zod";
import { PDFDocument, PDFEmbeddedPage } from "pdf-lib";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox"],
});

export const schemaPdfFormat = z.enum([
  "letter",
  "legal",
  "tabloid",
  "ledger",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
]);

export const schemaPdfNumber = z.union([
  z.number(),
  z.string().refine(
    (val) => {
      const m = /^([\d]+(\.[\d]+)?)(px|in|cm|mm)$/.exec(val);
      if (!m) {
        return false;
      }
      const [, num] = m;
      return z.coerce.number().safeParse(num).success;
    },
    { message: "invalid number" }
  ),
]);

export async function exportPdfFromHtml(
  content: string,
  options: PDFOptions
): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(content);
    return await page.pdf(options);
  } finally {
    await page?.close();
  }
}

export async function manipulatePdf(
  file: Uint8Array,
  options: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creator?: string;
    producer?: string;
    language?: string;
    creationDate?: Date;
    modificationDate?: Date;
  }
) {
  const pdfDoc = await PDFDocument.load(file);
  if (options.title) {
    pdfDoc.setTitle(options.title, { showInWindowTitleBar: true });
  }
  if (options.author) {
    pdfDoc.setAuthor(options.author);
  }
  if (options.subject) {
    pdfDoc.setSubject(options.subject);
  }
  if (options.keywords) {
    pdfDoc.setKeywords(options.keywords);
  }
  if (options.creator) {
    pdfDoc.setCreator(options.creator);
  }
  if (options.producer) {
    pdfDoc.setProducer(options.producer);
  }
  if (options.language) {
    pdfDoc.setLanguage(options.language);
  }
  if (options.creationDate) {
    pdfDoc.setCreationDate(options.creationDate);
  }
  if (options.modificationDate) {
    pdfDoc.setModificationDate(options.modificationDate);
  }

  return await pdfDoc.save();
}

export async function mergePdfs(files: Uint8Array[]) {
  const output = await PDFDocument.create();

  for (const file of files) {
    const pdf = await PDFDocument.load(file);
    const pdfCopy = await output.copyPages(pdf, pdf.getPageIndices());
    for (const page of pdfCopy) {
      output.addPage(page);
    }
  }

  return await output.save();
}

export async function overlayPdfs(main: Uint8Array, overlays: Uint8Array[]) {
  const pdfDoc = await PDFDocument.load(main);
  const overlayDocs: PDFEmbeddedPage[] = [];
  for (const overlay of overlays) {
    const [page] = await pdfDoc.embedPdf(overlay);
    overlayDocs.push(page);
  }

  for (const page of pdfDoc.getPages()) {
    const pageSize = page.getSize();

    for (const overlay of overlayDocs) {
      const overlaySize = overlay.size();
      const ratioH = pageSize.height / overlaySize.height;
      const ratioW = pageSize.width / overlaySize.width;
      const scale = ratioH; // Math.min(ratioW, ratioH);

      // const y = pageSize.height - overlaySize.height * scale;
      page.drawPage(overlay, {
        width: overlaySize.width * scale,
        height: overlaySize.height * scale,
        x: 0,
        y: 0,
      });
    }
  }

  return await pdfDoc.save();
}
