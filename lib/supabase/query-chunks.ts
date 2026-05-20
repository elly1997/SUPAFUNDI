import "server-only";

/** Keep `.in(uuid[])` filters under PostgREST URL limits (~80 UUIDs per request). */
export const SUPABASE_IN_FILTER_CHUNK = 80;

const PAGE_SIZE = 1000;

export async function fetchAllPaginated<T>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function fetchByInChunks<T, Id extends string>(
  ids: Id[],
  fetchChunk: (
    chunk: Id[]
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += SUPABASE_IN_FILTER_CHUNK) {
    const chunk = unique.slice(i, i + SUPABASE_IN_FILTER_CHUNK);
    const { data, error } = await fetchChunk(chunk);
    if (error) throw new Error(error.message);
    if (data?.length) out.push(...data);
  }
  return out;
}
