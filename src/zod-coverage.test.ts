import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { dateAsIso, dateAsNumberMs, dateAsNumberSeconds, json } from "./codec";
import { createTypedStore } from "./store";

const bigintAsString = z.codec(z.string(), z.bigint(), {
  encode: (b) => b.toString(),
  decode: (s) => BigInt(s),
});

const unionObj = z.union([
  z.object({ kind: z.literal("a"), a: z.string() }),
  z.object({ kind: z.literal("b"), b: z.number() }),
]);

const discUnion = z.discriminatedUnion("type", [
  z.object({ type: z.literal("a"), a: z.string() }),
  z.object({ type: z.literal("b"), b: z.number() }),
]);

const rowSchema = z.object({
  tup: json(z.tuple([z.string(), z.number()])),
  rec: json(z.record(z.string(), z.number())),
  union: json(unionObj),
  disc: json(discUnion),
  optObj: json(z.object({ a: z.string() })).optional(),
  date: dateAsIso,
  dateMs: dateAsNumberMs,
  dateSec: dateAsNumberSeconds,
  big: bigintAsString,
});

const schema = {
  tables: { t: rowSchema },
  values: z.object({
    tup: json(z.tuple([z.string(), z.number()])),
    rec: json(z.record(z.string(), z.number())),
    union: json(unionObj),
    disc: json(discUnion),
    optObj: json(z.object({ a: z.string() })).optional(),
    date: dateAsIso,
    dateMs: dateAsNumberMs,
    dateSec: dateAsNumberSeconds,
    big: bigintAsString,
  }),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  store.setTables({ t: {} });
  store.setValues({});
  return { store, typed };
}

test("sentinel: JSON-structured schemas are stored as JSON strings (cells)", () => {
  const { store, typed } = setup();

  typed.setRow("t", "1", {
    tup: ["seed", 0],
    rec: {},
    union: { kind: "a", a: "seed" },
    disc: { type: "a", a: "seed" },
    optObj: { a: "seed" },
    date: new Date("2020-01-01T00:00:00.000Z"),
    dateMs: new Date("2020-01-01T00:00:00.000Z"),
    dateSec: new Date("2020-01-01T00:00:00.000Z"),
    big: 1n,
  });

  typed.setCell("t", "1", "tup", ["a", 1]);
  expect(typed.getCell("t", "1", "tup")).toEqual(["a", 1]);
  expect(store.getCell("t", "1", "tup")).toBe(JSON.stringify(["a", 1]));

  typed.setCell("t", "1", "rec", { x: 1, y: 2 });
  expect(typed.getCell("t", "1", "rec")).toEqual({ x: 1, y: 2 });
  expect(store.getCell("t", "1", "rec")).toBe(JSON.stringify({ x: 1, y: 2 }));

  typed.setCell("t", "1", "union", { kind: "b", b: 2 });
  expect(typed.getCell("t", "1", "union")).toEqual({ kind: "b", b: 2 });
  expect(store.getCell("t", "1", "union")).toBe(
    JSON.stringify({ kind: "b", b: 2 })
  );

  typed.setCell("t", "1", "disc", { type: "b", b: 3 });
  expect(typed.getCell("t", "1", "disc")).toEqual({ type: "b", b: 3 });
  expect(store.getCell("t", "1", "disc")).toBe(
    JSON.stringify({ type: "b", b: 3 })
  );

  // Wrapper delegation: optional object should still JSON-string encode when present.
  typed.setCell("t", "1", "optObj", { a: "x" });
  expect(typed.getCell("t", "1", "optObj")).toEqual({ a: "x" });
  expect(store.getCell("t", "1", "optObj")).toBe(JSON.stringify({ a: "x" }));
});

test("sentinel: explicit codecs store non-JSON types as strings (cells)", () => {
  const { store, typed } = setup();

  typed.setRow("t", "1", {
    tup: ["seed", 0],
    rec: {},
    union: { kind: "a", a: "seed" },
    disc: { type: "a", a: "seed" },
    optObj: { a: "seed" },
    date: new Date("2020-01-01T00:00:00.000Z"),
    dateMs: new Date("2020-01-01T00:00:00.000Z"),
    dateSec: new Date("2020-01-01T00:00:00.000Z"),
    big: 1n,
  });

  const d = new Date("2024-02-03T04:05:06.789Z");
  typed.setCell("t", "1", "date", d);
  expect(typed.getCell("t", "1", "date")).toEqual(d);
  // Should be a plain ISO string, not a JSON-quoted ISO string.
  expect(store.getCell("t", "1", "date")).toBe(d.toISOString());

  const dMs = new Date("2024-02-03T04:05:06.789Z");
  typed.setCell("t", "1", "dateMs", dMs);
  expect(typed.getCell("t", "1", "dateMs")).toEqual(dMs);
  expect(store.getCell("t", "1", "dateMs")).toBe(dMs.getTime());

  const dSec = new Date("2024-02-03T04:05:06.000Z");
  typed.setCell("t", "1", "dateSec", dSec);
  expect(typed.getCell("t", "1", "dateSec")).toEqual(dSec);
  expect(store.getCell("t", "1", "dateSec")).toBe(dSec.getTime() / 1000);

  typed.setCell("t", "1", "big", 9007199254740993n);
  expect(typed.getCell("t", "1", "big")).toBe(9007199254740993n);
  expect(store.getCell("t", "1", "big")).toBe("9007199254740993");
});

test("sentinel: JSON-structured schemas are stored as JSON strings (values)", () => {
  const { store, typed } = setup();

  typed.setValue("tup", ["a", 1]);
  expect(typed.getValue("tup")).toEqual(["a", 1]);
  expect(store.getValue("tup")).toBe(JSON.stringify(["a", 1]));

  typed.setValue("rec", { x: 1, y: 2 });
  expect(typed.getValue("rec")).toEqual({ x: 1, y: 2 });
  expect(store.getValue("rec")).toBe(JSON.stringify({ x: 1, y: 2 }));

  typed.setValue("union", { kind: "b", b: 2 });
  expect(typed.getValue("union")).toEqual({ kind: "b", b: 2 });
  expect(store.getValue("union")).toBe(JSON.stringify({ kind: "b", b: 2 }));

  typed.setValue("disc", { type: "b", b: 3 });
  expect(typed.getValue("disc")).toEqual({ type: "b", b: 3 });
  expect(store.getValue("disc")).toBe(JSON.stringify({ type: "b", b: 3 }));

  typed.setValue("optObj", { a: "x" });
  expect(typed.getValue("optObj")).toEqual({ a: "x" });
  expect(store.getValue("optObj")).toBe(JSON.stringify({ a: "x" }));
});

test("sentinel: explicit codecs store non-JSON types as strings (values)", () => {
  const { store, typed } = setup();

  const d = new Date("2024-02-03T04:05:06.789Z");
  typed.setValue("date", d);
  expect(typed.getValue("date")).toEqual(d);
  expect(store.getValue("date")).toBe(d.toISOString());

  const dMs = new Date("2024-02-03T04:05:06.789Z");
  typed.setValue("dateMs", dMs);
  expect(typed.getValue("dateMs")).toEqual(dMs);
  expect(store.getValue("dateMs")).toBe(dMs.getTime());

  const dSec = new Date("2024-02-03T04:05:06.000Z");
  typed.setValue("dateSec", dSec);
  expect(typed.getValue("dateSec")).toEqual(dSec);
  expect(store.getValue("dateSec")).toBe(dSec.getTime() / 1000);

  typed.setValue("big", 9007199254740993n);
  expect(typed.getValue("big")).toBe(9007199254740993n);
  expect(store.getValue("big")).toBe("9007199254740993");
});

test("rejections: schemas that encode to non-primitives fail at write time", () => {
  const store = createStore();
  store.setTables({ t: {} });

  const typed = createTypedStore(store, {
    tables: { t: z.object({ d: z.date() }) },
    values: z.object({}),
  } as const);
  expect(() =>
    typed.setRow("t", "1", { d: new Date("2020-01-01T00:00:00.000Z") })
  ).toThrow();

  const typed2 = createTypedStore(store, {
    tables: { t: z.object({ b: z.bigint() }) },
    values: z.object({}),
  } as const);
  expect(() => typed2.setRow("t", "2", { b: 1n })).toThrow();

  const typed3 = createTypedStore(store, {
    tables: { t: z.object({ m: z.map(z.string(), z.number()) }) },
    values: z.object({}),
  } as const);
  expect(() => typed3.setRow("t", "3", { m: new Map() })).toThrow();

  const typed4 = createTypedStore(store, {
    tables: { t: z.object({ s: z.set(z.number()) }) },
    values: z.object({}),
  } as const);
  expect(() => typed4.setRow("t", "4", { s: new Set() })).toThrow();

  const typed5 = createTypedStore(store, {
    tables: { t: z.object({ f: z.function() }) },
    values: z.object({}),
  } as const);
  expect(() =>
    typed5.setRow("t", "5", { f: (() => undefined) as any })
  ).toThrow();
});

test("note: unidirectional transforms (preprocess/transform) are not encodable in zod v4", () => {
  const store = createStore();
  store.setTables({ t: {} });
  const typed = createTypedStore(store, {
    tables: {
      t: z.object({ x: z.string().transform((s) => s.toUpperCase()) }),
    },
    values: z.object({}),
  } as const);
  // Seed the underlying store with a primitive value.
  store.setRow("t", "1", { x: "seed" });
  // Encoding for a unidirectional transform is not supported by Zod.
  expect(() => typed.setCell("t", "1", "x", "a")).toThrow();
});
