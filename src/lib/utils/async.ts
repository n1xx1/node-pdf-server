export async function asyncIterToArray<T>(
  iter: AsyncIterableIterator<T>
): Promise<T[]> {
  const ret: T[] = [];
  for await (const x of iter) {
    ret.push(x);
  }
  return ret;
}
