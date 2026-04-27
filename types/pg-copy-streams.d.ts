/**
 * Minimal ambient types for `pg-copy-streams`. The package ships no types
 * and has no DefinitelyTyped entry. The exported `from` / `to` factories
 * return objects that are *both* pg `Submittable`s (so `client.query(...)`
 * accepts them) AND Node `Writable` / `Readable` streams (so `pipeline`
 * accepts them). We type them as `any` to bridge the two — the import
 * script is the only consumer and runtime behavior is well documented.
 */
declare module "pg-copy-streams" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function from(sql: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function to(sql: string): any;
}
