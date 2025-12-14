import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const schema = {
  tables: {},
  values: z.object({
    str: z.string(),
    maybe: z.string().nullable(),
    num: z.number(),
    flag: z.boolean(),
    obj: json(z.object({ a: z.string() })),
    arr: json(z.array(z.string())),
  }),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  store.setTables({});
  store.setValues({});
  return { store, typed };
}

test("getValue/setValue/delValue (primitive + complex encoding)", () => {
  const { store, typed } = setup();

  expect(typed.getValue("str")).toBe(undefined);

  typed.setValue("str", "s");
  expect(typed.getValue("str")).toBe("s");
  expect(store.getValue("str")).toBe("s");

  typed.setValue("obj", { a: "x" });
  expect(typed.getValue("obj")).toEqual({ a: "x" });
  expect(store.getValue("obj")).toBe(JSON.stringify({ a: "x" }));

  typed.setValue("arr", ["a", "b"]);
  expect(typed.getValue("arr")).toEqual(["a", "b"]);
  expect(store.getValue("arr")).toBe(JSON.stringify(["a", "b"]));

  expect(typed.hasValue("str")).toBe(true);
  typed.delValue("str");
  expect(typed.hasValue("str")).toBe(false);
  expect(typed.getValue("str")).toBe(undefined);
});

test("setValue mapper receives decoded value and encodes return", () => {
  const { store, typed } = setup();

  typed.setValue("num", 1);
  typed.setValue("num", (v) => (v ?? 0) + 1);
  expect(typed.getValue("num")).toBe(2);

  typed.setValue("maybe", (v) => (v ?? "x") + "y");
  expect(typed.getValue("maybe")).toBe("xy");

  typed.setValue("obj", { a: "x" });
  typed.setValue("obj", (v) => ({ a: `${v?.a}y` }));
  expect(typed.getValue("obj")).toEqual({ a: "xy" });
  expect(store.getValue("obj")).toBe(JSON.stringify({ a: "xy" }));

  typed.setValue("arr", ["a"]);
  typed.setValue("arr", (v) => (v ? [...v, "b"] : ["b"]));
  expect(typed.getValue("arr")).toEqual(["a", "b"]);
  expect(store.getValue("arr")).toBe(JSON.stringify(["a", "b"]));
});

test("getValues/setValues/delValues ignore unknown ids when schema is provided", () => {
  const { store, typed } = setup();

  typed.setValues({ str: "a", num: 1, obj: { a: "x" } });

  // Underlying store should hold JSON strings for complex values.
  expect(store.getValue("obj")).toBe(JSON.stringify({ a: "x" }));

  const values = typed.getValues();
  expect(values).toEqual({ str: "a", num: 1, obj: { a: "x" } });

  // Unknown ids in underlying store should be ignored.
  store.setValue("extra", "raw");
  expect(typed.getValues()).toEqual({ str: "a", num: 1, obj: { a: "x" } });

  // Unknown ids in setValues input should be ignored.
  typed.setValues({ str: "b", extra: "nope" } as any);
  expect(store.hasValue("extra")).toBe(false);
  expect(store.getValue("extra")).toBe(undefined);
  expect(typed.getValue("str")).toBe("b");

  typed.delValues();
  expect(typed.hasValues()).toBe(false);
  expect(typed.getValues()).toEqual({});
});

test("hasValue + getValueIds reflect only known ids", () => {
  const { store, typed } = setup();

  // Add an unknown id directly in the underlying store.
  store.setValue("extra", "raw");

  typed.setValue("str", "a");
  typed.setValue("flag", true);

  expect(typed.hasValue("str")).toBe(true);
  expect(typed.hasValue("num")).toBe(false);

  const ids = typed.getValueIds().slice().sort();
  expect(ids).toEqual(["flag", "str"]);
});
