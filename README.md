## tinybase-zod

A small TypeScript library that wraps a TinyBase `Store` with a **Zod-backed typed API**.

You describe your data model once as a Zod schema:

- **Tables**: `tables: { [tableId]: z.object({ ...cells }) }`
- **Values**: `values: z.object({ ...valueIds })`

…and `createTypedStore(store, schema)` returns a `typedStore` whose `get*` methods **decode** and whose `set*` methods **encode**, while keeping **TinyBase’s API shape** (tables/rows/cells/values + listeners + transactions).

### Status

Public entrypoint: `src/index.ts` (re-exports `codec`, `store`, and `type`).

## The core idea (storage contract)

TinyBase cells are expected to be scalars, so this wrapper enforces a simple contract:

- **Every schema used in a table cell or value must encode to:**
  - `string | number | boolean | null | undefined`
- `undefined` means “delete / absent”

If a schema encodes to a non-primitive (for example a plain `z.object(...)`, `z.array(...)`, `z.date()`, `z.bigint()`, etc.), writes will throw with a message like:

- `Invalid encoded value for TinyBase storage at ... Expected string|number|boolean|null (or undefined to delete), got object.`

To store structured data, you must wrap it in an explicit codec.

## Quick start

```ts
import { createStore } from "tinybase";
import z from "zod";
import {
  createTypedStore,
  json,
  dateAsIso,
  dateAsNumberMs,
} from "tinybase-zod";

const userRow = z.object({
  name: z.string(),
  age: z.number(),

  // Structured cells must be wrapped so they encode to strings.
  prefs: json(z.object({ theme: z.enum(["light", "dark"]) })),
  tags: json(z.array(z.string())),

  // Non-JSON types should use explicit codecs too.
  createdAt: dateAsIso,

  // Or persist as numbers (ms since epoch).
  createdAtMs: dateAsNumberMs,
});

const schema = {
  tables: {
    users: userRow,
  },
  values: z.object({
    selectedUserId: z.string().nullable(),
  }),
} as const;

const store = createStore();
const typed = createTypedStore(store, schema);

// Tests typically initialize tables/values explicitly.
store.setTables({ users: {} });
store.setValues({});

typed.setRow("users", "u1", {
  name: "Ava",
  age: 34,
  prefs: { theme: "dark" },
  tags: ["admin"],
});

// Reads are decoded.
console.log(typed.getCell("users", "u1", "prefs")); // { theme: "dark" }

// Underlying TinyBase storage contains JSON strings for json(...) fields.
console.log(store.getCell("users", "u1", "prefs")); // '{"theme":"dark"}'
```

## How it works

### 1) You provide a schema

A `StoreSchema` is:

- **`tables`**: a map of table ids to `z.object({...})` row schemas
- **`values`**: a single `z.object({...})` for global values

`createTypedStore` does not auto-modify your schema. It uses it as-is.

### 2) Reads decode, writes encode

- **Tables** are encoded/decoded via `z.record(z.string(), rowSchema)`.
- `getTable`, `getRow`, `getCell`, `getValue` return decoded values.
- `setTable`, `setRow`, `setCell`, `setValue` encode before writing.

On every write, the wrapper validates that encoded cells are storage scalars.

### 3) `undefined` is treated as deletion

- When writing rows/tables, any encoded `undefined` cells are stripped.
- When writing a single cell/value, if the encoded result is `undefined`, the wrapper deletes it.

This means you can model “optional deletes” using codecs that sometimes encode to `undefined`.

### 4) Listener payloads are decoded

Listener callbacks wrap the underlying TinyBase listener and:

- pass `typedStore` instead of the raw store
- decode `new`/`old` values
- decode `getCellChange(...)` / `getValueChange(...)` results when those helper functions are available

Mutator listeners (`mutator: true`) behave like TinyBase: they run before non-mutators and can safely update state.

## How to store structured data

### JSON strings via `json(...)`

`src/codec.ts` exports a helper:

- `json(schema)` wraps any JSON-serializable schema and stores it as a JSON string.

It is implemented via `z.codec(...)` with `JSON.stringify` / `JSON.parse`.

If you need `null`/`undefined` support, apply wrappers outside the codec:

```ts
const maybePrefs = json(z.object({ theme: z.string() })).optional();
const nullablePrefs = json(z.object({ theme: z.string() })).nullable();
```

Use it for:

- objects (`z.object(...)`)
- arrays (`z.array(...)`)
- tuples / records / unions that decode to JSON data

### Custom codecs (dates, bigints, etc.)

For non-JSON types, define your own storage representation:

```ts
import { z } from "zod";

export const bigintAsString = z.codec(z.string(), z.bigint(), {
  encode: (b) => b.toString(),
  decode: (s) => BigInt(s),
});
```

This repo also ships date codecs in `src/codec.ts`:

- `dateAsIso` (ISO string)
- `dateAsNumberMs` / `dateAsNumberSeconds` (numbers)

## TinyBase limitations / gotchas

### No partial rows (important)

This wrapper intentionally avoids a common TinyBase behavior: **creating/patching rows implicitly via `setCell`**.

- **`typed.setCell(...)` throws if the row does not already exist**.

  - This prevents accidentally creating a “partial” row that does not satisfy your Zod row schema.
  - Create rows with `setRow(...)` first.

- **`typed.setRow(...)` expects a schema-valid row**.
  - If you want “partial row updates”, model that explicitly:
    - make fields optional in your Zod schema, or
    - update individual cells with `setCell(...)` after creating the row.

### Underlying storage is not your runtime shape

If you access the underlying TinyBase `store` directly, you’ll see encoded storage values (for example JSON strings), not decoded runtime objects.

## Zod limitations / gotchas

### Schemas must be encodable

Because writes call `.encode()`, any schema that can’t encode will fail at runtime.

Common causes:

- **Plain structured schemas** (`z.object`, `z.array`, etc.) encode to objects/arrays → wrap with `json(...)`.
- **Unidirectional transforms** (`z.preprocess`, `.transform`) are not encodable in Zod v4 → use a bidirectional `z.codec(...)` instead.

## Development

### Install

```bash
bun install
```

### Run tests

```bash
bun test
```

### Typecheck

```bash
bun run check
```

### Build (for publishing)

```bash
bun run build
```

## Files to look at

- `src/store.ts`: implementation of `createTypedStore`
- `src/codec.ts`: storage codecs like `json(...)` and `dateAsIso`
- `src/type.ts`: the TypeScript type-level surface for `TypedStore<Schema>`
- `src/example.ts`: a small usage sketch
- `src/*.test.ts`: runtime behavior tests
- `src/*.type.test.ts`: type-level tests
