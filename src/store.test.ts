import { beforeEach, expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const simpleSchema = z.object({
  s: z.string(),
  o: json(z.object({ s: z.string() })),
});

const store = createStore();
const typed = createTypedStore(store, {
  tables: { t: simpleSchema },
  values: z.object({}),
});

beforeEach(() => {
  store.setTables({ t: {} });
});

test("table", () => {
  typed.setTable("t", { "1": { s: "s", o: { s: "s" } } });
  expect(typed.getTable("t")).toEqual({ "1": { s: "s", o: { s: "s" } } });
  typed.delTable("t");
  expect(typed.getTable("t")).toEqual({});
});

test("tables", () => {
  typed.setTables({ t: { "1": { s: "s", o: { s: "s" } } } });
  expect(typed.getTables()).toEqual({ t: { "1": { s: "s", o: { s: "s" } } } });
  typed.delTables();
  expect(typed.getTables()).toEqual({});
});

test("row", () => {
  typed.setRow("t", "1", { s: "s", o: { s: "s" } });
  expect(typed.getRow("t", "1")).toEqual({ s: "s", o: { s: "s" } });
  typed.delRow("t", "1");
  expect(typed.getRow("t", "1")).toEqual(undefined);
});

test("cell", () => {
  typed.setRow("t", "1", { s: "seed", o: { s: "o" } });
  typed.setCell("t", "1", "s", "s");
  expect(typed.getCell("t", "1", "s")).toEqual("s");
  typed.delCell("t", "1", "s");
  expect(typed.getCell("t", "1", "s")).toEqual(undefined);
});

test("map cell", () => {
  typed.setRow("t", "1", { s: "seed", o: { s: "o" } });
  typed.setCell("t", "1", "s", "s");
  typed.setCell("t", "1", "s", (c) => `${c}s`);
  expect(typed.getCell("t", "1", "s")).toEqual("ss");
  expect(() => typed.setCell("t", "2", "s", (c) => `${c}s`)).toThrow();
});
