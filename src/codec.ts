import { z } from "zod";
import type { SomeType, input } from "zod/v4/core";

/**
 * Store JSON-serializable values as JSON strings.
 *
 * Use wrappers *outside* the codec for nullish/optional behavior:
 * - json(schema).optional()
 * - json(schema).nullable()
 */
export function json<B extends SomeType>(schema: B) {
  return z.codec(z.string(), schema, {
    decode: (stored: string) => JSON.parse(stored) as input<B>,
    encode: (value: input<B>) => JSON.stringify(value),
  });
}

/**
 * Store Dates as ISO-8601 strings.
 */
export const dateAsIso = z.codec(z.string(), z.date(), {
  encode: (d) => d.toISOString(),
  decode: (s) => new Date(s),
});

/**
 * Store Dates as numbers (milliseconds since Unix epoch).
 */
export const dateAsNumberMs = z.codec(z.number(), z.date(), {
  encode: (d) => d.getTime(),
  decode: (ms) => new Date(ms),
});

/**
 * Store Dates as numbers (seconds since Unix epoch).
 *
 * Note: This intentionally truncates sub-second precision.
 */
export const dateAsNumberSeconds = z.codec(z.number(), z.date(), {
  encode: (d) => Math.trunc(d.getTime() / 1000),
  decode: (seconds) => new Date(seconds * 1000),
});

/**
 * Alias for `dateAsNumberMs`.
 */
export const dateAsNumber = dateAsNumberMs;
