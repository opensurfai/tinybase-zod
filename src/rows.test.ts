import { beforeEach, expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

/**
 * Runtime test suite: Rows
 *
 * Notes:
 * - The typed wrapper encodes object/array cells as JSON strings in the
 *   underlying TinyBase store, and decodes them back on reads.
 */

const rowSchema = z.object({
  s: z.string(),
  n: z.number(),
  o: json(z.object({ s: z.string() })),
});

const store = createStore();
const typed = createTypedStore(store, {
  tables: { t: rowSchema },
  values: z.object({}),
});

beforeEach(() => {
  store.setTables({ t: {} });
});

test("getRow/setRow/delRow (encode/decode + missing row semantics)", () => {
  // missing row -> undefined (TinyBase returns {} or undefined depending on state)
  expect(typed.getRow("t", "missing")).toEqual(undefined);
  expect(typed.hasRow("t", "missing")).toBe(false);

  // setRow encodes complex cells in the underlying store
  typed.setRow("t", "1", { s: "a", n: 1, o: { s: "x" } });
  expect(store.getRow("t", "1")).toEqual({ s: "a", n: 1, o: '{"s":"x"}' });

  // getRow decodes complex cells back to structured values
  expect(typed.getRow("t", "1")).toEqual({ s: "a", n: 1, o: { s: "x" } });
  expect(typed.hasRow("t", "1")).toBe(true);

  // getRow decodes rows even if written in encoded form directly
  store.setRow("t", "2", { s: "b", n: 2, o: '{"s":"y"}' });
  expect(typed.getRow("t", "2")).toEqual({ s: "b", n: 2, o: { s: "y" } });

  // delRow removes row and typed getRow returns undefined
  typed.delRow("t", "1");
  expect(typed.getRow("t", "1")).toEqual(undefined);
  expect(typed.hasRow("t", "1")).toBe(false);
});

test("getRowIds + hasRow", () => {
  typed.setRow("t", "2", { s: "b", n: 2, o: { s: "x" } });
  typed.setRow("t", "1", { s: "a", n: 1, o: { s: "y" } });

  // Don't rely on TinyBase's row id ordering for getRowIds
  expect(typed.getRowIds("t").slice().sort()).toEqual(["1", "2"]);
  expect(typed.hasRow("t", "1")).toBe(true);
  expect(typed.hasRow("t", "missing")).toBe(false);
});

test("getSortedRowIds (string cell, number cell, descending, offset/limit)", () => {
  typed.setRow("t", "1", { s: "b", n: 2, o: { s: "x" } });
  typed.setRow("t", "2", { s: "a", n: 3, o: { s: "y" } });
  typed.setRow("t", "3", { s: "c", n: 1, o: { s: "z" } });

  // default sort (by Row Id)
  expect(typed.getSortedRowIds("t")).toEqual(["1", "2", "3"]);

  // sort by string cell
  expect(typed.getSortedRowIds("t", "s")).toEqual(["2", "1", "3"]);
  expect(typed.getSortedRowIds("t", "s", true)).toEqual(["3", "1", "2"]);

  // sort by number cell
  expect(typed.getSortedRowIds("t", "n")).toEqual(["3", "1", "2"]);
  expect(typed.getSortedRowIds("t", "n", true)).toEqual(["2", "1", "3"]);

  // pagination
  expect(typed.getSortedRowIds("t", "n", false, 1, 1)).toEqual(["1"]);
  expect(typed.getSortedRowIds("t", "s", true, 1, 1)).toEqual(["1"]);
});

test("getSortedRowIds (object-form SortedRowIdsArgs variant)", () => {
  typed.setRow("t", "1", { s: "b", n: 2, o: { s: "x" } });
  typed.setRow("t", "2", { s: "a", n: 3, o: { s: "y" } });
  typed.setRow("t", "3", { s: "c", n: 1, o: { s: "z" } });

  expect(
    typed.getSortedRowIds({
      tableId: "t",
      cellId: "s",
      descending: true,
      offset: 1,
      limit: 1,
    })
  ).toEqual(["1"]);
});
