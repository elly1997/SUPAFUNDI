/** Strip class instances / null prototypes for Next.js Server Action responses. */
export function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
