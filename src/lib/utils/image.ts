import imageSize from "image-size";
import { load } from "cheerio";
import { PDFOptions } from "puppeteer";

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
  const src = `data:${blob.type};base64,${buffer.toString("base64")}`;
  return src;
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
  display: block !important;
  padding-left: ${getMargin(options, "left", "10mm")} !important;
  padding-right: ${getMargin(options, "right", "10mm")} !important;
}
#header {
  padding-top: 0 !important;
}
#footer {
  padding-bottom: 0 !important;
}
#header > div, #footer > div {
  zoom: 75%;
  width: 100%;
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
  return `<style>${styles(options)}</style><div>${body}</div>`;
}
