import { Multipart, MultipartFields } from "@fastify/multipart";

export async function asyncIterToArray(
  iter: AsyncIterableIterator<Multipart>
): Promise<Multipart[]> {
  const ret: Multipart[] = [];
  for await (const x of iter) {
    ret.push(x);
    if (x.type === "file") {
      await x.toBuffer();
    }
  }
  return ret;
}
