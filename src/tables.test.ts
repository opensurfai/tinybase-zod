import { beforeEach, expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

/**
 * Runtime test suite: Tables
 *
 * Notes:
 * - The typed wrapper encodes object/array cells as JSON strings in the
 *   underlying TinyBase store, and decodes them back on reads.
 * - getTables/setTables ignore tables not in the schema.
 */

const rowSchema = z.object({
  s: z.string(),
  o: json(z.object({ s: z.string() })),
  a: json(z.array(z.string())),
});

const store = createStore();
const typed = createTypedStore(store, {
  tables: { t: rowSchema },
  values: z.object({}),
});

beforeEach(() => {
  store.setTables({ t: {} });
});

test("getTables/setTables/delTables (encode/decode + ignore unknown tables)", () => {
  typed.setTables({
    t: {
      "1": { s: "s", o: { s: "x" }, a: ["a", "b"] },
    },
  });

  // setTables encodes complex cells in the underlying store
  expect(store.getTables()).toEqual({
    t: {
      "1": { s: "s", o: '{"s":"x"}', a: '["a","b"]' },
    },
  });

  // getTables decodes complex cells back to structured values
  expect(typed.getTables()).toEqual({
    t: {
      "1": { s: "s", o: { s: "x" }, a: ["a", "b"] },
    },
  });

  // getTables ignores tables not in schema
  store.setTables({
    t: {
      "2": { s: "s", o: '{"s":"y"}', a: '["c"]' },
    },
    unknown: {
      "1": { any: "thing" },
    },
  });
  expect(typed.getTables()).toEqual({
    t: {
      "2": { s: "s", o: { s: "y" }, a: ["c"] },
    },
  });

  // setTables ignores tables not in schema (and therefore does not write them)
  typed.setTables({
    t: {
      "3": { s: "s", o: { s: "z" }, a: [] },
    },
    unknown: {
      "2": { any: "thing" },
    },
  } as any);

  expect(store.getTables()).toEqual({
    t: {
      "3": { s: "s", o: '{"s":"z"}', a: "[]" },
    },
  });

  typed.delTables();
  expect(store.getTables()).toEqual({});
  expect(typed.getTables()).toEqual({});
  expect(typed.hasTables()).toBe(false);
});

test("getTable/setTable/delTable (encode/decode)", () => {
  typed.setTable("t", {
    "1": { s: "s", o: { s: "x" }, a: ["a"] },
  });

  // setTable encodes complex cells in the underlying store
  expect(store.getTable("t")).toEqual({
    "1": { s: "s", o: '{"s":"x"}', a: '["a"]' },
  });

  // getTable decodes complex cells back
  expect(typed.getTable("t")).toEqual({
    "1": { s: "s", o: { s: "x" }, a: ["a"] },
  });

  // getTable decodes even if written in encoded form directly
  store.setTable("t", {
    "2": { s: "s", o: '{"s":"y"}', a: '["b","c"]' },
  });
  expect(typed.getTable("t")).toEqual({
    "2": { s: "s", o: { s: "y" }, a: ["b", "c"] },
  });

  typed.delTable("t");
  expect(typed.getTable("t")).toEqual({});
  expect(typed.hasTable("t")).toBe(false);
});

test("hasTables/hasTable + getTableIds", () => {
  typed.delTables();
  expect(typed.hasTables()).toBe(false);

  typed.setRow("t", "1", { s: "s", o: { s: "x" }, a: [] });
  expect(typed.hasTables()).toBe(true);
  expect(typed.hasTable("t")).toBe(true);

  // With only schema tables present, getTableIds should just include "t"
  expect(typed.getTableIds()).toEqual(["t"]);

  typed.delTable("t");
  expect(typed.hasTable("t")).toBe(false);
  expect(typed.hasTables()).toBe(false);
});

test("getTableCellIds + hasTableCell", () => {
  typed.setRow("t", "1", { s: "s", o: { s: "x" }, a: ["a"] });

  expect(typed.getTableCellIds("t").slice().sort()).toEqual(["a", "o", "s"]);
  expect(typed.hasTableCell("t", "s")).toBe(true);
  expect(typed.hasTableCell("t", "o")).toBe(true);
  expect(typed.hasTableCell("t", "a")).toBe(true);

  expect(typed.hasTableCell("t", "missing" as any)).toBe(false);
});
