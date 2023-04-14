import imageSize from "image-size";
import { load } from "cheerio";
import { PDFOptions } from "puppeteer";
import sharp from "sharp";

function tryImageSize(buffer: Buffer) {
  try {
    const res = imageSize(buffer);
    if (res.width && res.height) {
      return { width: res.width, height: res.height };
    }
  } catch (e) {}
  return { width: 0, height: 0 };
}

async function fetchBase64(url: string) {
  const resp = await fetch(url);
  const blob = await resp.blob();

  // const { width, height } = tryImageSize(Buffer.from(await blob.arrayBuffer()));

  const buffer = Buffer.from(await blob.arrayBuffer());
  return getBlobString(blob.type, buffer);
}

function getBlobString(type: string, buffer: Buffer) {
  return `data:${type};base64,${buffer.toString("base64")}`;
}

export async function fetchImageAndResize(url: string, dimMax: number) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  let buffer = await blob.arrayBuffer();

  try {
    let s = sharp(buffer);
    let changed = false;
    const meta = await s.metadata();

    const width = meta.width!;
    const height = meta.height!;

    if (width > height) {
      if (width > dimMax) {
        s = s.resize({ width: dimMax });
        changed = true;
      }
    } else {
      if (height > dimMax) {
        s = s.resize({ height: dimMax });
      }
    }

    if (changed) {
      buffer = await s.toBuffer();
    } else {
      s.destroy();
    }
  } catch (e) {
    console.warn("failed to resize");
  }

  return getBlobString(blob.type, Buffer.from(buffer));
}

export async function resizeImagesInHtml(html: string, dimMax: number) {
  const $ = load(html);

  const imgs = $("img");
  for (const img of imgs) {
    const $img = $(img);
    const attrSrc = $img.attr("src");
    if (!attrSrc) {
      continue;
    }
    const res = await fetchImageAndResize(attrSrc, dimMax).catch((e) => {
      console.warn(e);
      Promise.resolve(null);
    });
    if (!res) {
      continue;
    }
    $img.attr("src", res);
  }

  return $.html();
}

function getMargin(
  options: PDFOptions,
  key: "left" | "right" | "top" | "bottom",
  def: string
) {
  const val = options?.margin?.[key];
  if (val) {
    if (typeof val === "number") {
      return `${val}mm`;
    }
    return val;
  }
  return def;
}

const styles = (options: PDFOptions) => `
#header, #footer {
  padding-left: ${getMargin(options, "left", "10mm")} !important;
  padding-right: ${getMargin(options, "right", "10mm")} !important;
}
#header {
  padding-top: 5mm !important;
}
#footer {
  padding-bottom: 5mm !important;
}
#header > div, #footer > div {
  zoom: 75%;
  width: 100%;
  font-size: 12px;
}
`;

const fontMap: Record<string, string | undefined> = {
  "xx-small": "7px",
  "x-small": "9px",
  small: "10px",
  medium: "12px",
  large: "14px",
  "x-large": "16px",
  "xx-large": "20px",
};

export async function formatPdfHeaderAndFooter(
  html: string,
  options: PDFOptions
) {
  const $ = load(html);

  $("*").each((i, el) => {
    const fs = fontMap[$(el).css("font-size") ?? ""];
    if (fs) {
      $(el).css("font-size", fs);
    }
  });

  const imgs = $("img");
  for (const img of imgs) {
    const $img = $(img);
    const attrSrc = $img.attr("src");
    if (!attrSrc) {
      continue;
    }
    const res = await fetchBase64(attrSrc).catch((e) => {
      console.warn(e);
      Promise.resolve(null);
    });
    if (!res) {
      continue;
    }
    $img.attr("src", res);
  }
  const body = $("body").html() ?? "";
  return `
<style>${styles(options)}</style>
<div>${body}</div>`;
}
