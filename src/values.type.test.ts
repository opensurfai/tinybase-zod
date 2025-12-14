import { expect, expectTypeOf, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

test("values api types", () => {
  const store = createStore();

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

  const typed = createTypedStore(store, schema);

  expectTypeOf(typed.getValue("str")).toEqualTypeOf<string | undefined>();
  expectTypeOf(typed.getValue("maybe")).toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf(typed.getValue("num")).toEqualTypeOf<number | undefined>();
  expectTypeOf(typed.getValue("flag")).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(typed.getValue("obj")).toEqualTypeOf<
    { a: string } | undefined
  >();
  expectTypeOf(typed.getValue("arr")).toEqualTypeOf<string[] | undefined>();

  typed.setValue("str", "s");
  typed.setValue("maybe", null);
  typed.setValue("num", 1);
  typed.setValue("flag", true);
  typed.setValue("obj", { a: "x" });
  typed.setValue("arr", ["a"]);

  typed.setValue("maybe", (v) => {
    expectTypeOf(v).toEqualTypeOf<string | null | undefined>();
    return v ?? "s";
  });

  if (false) {
    // @ts-expect-error wrong value type
    typed.setValue("num", "nope");
    // @ts-expect-error wrong object shape
    typed.setValue("obj", "nope");
    // @ts-expect-error wrong array element type
    typed.setValue("arr", [1]);
  }

  expectTypeOf(typed.getValueIds()).toEqualTypeOf<
    Array<"str" | "maybe" | "num" | "flag" | "obj" | "arr">
  >();
});

test("addValueListener types (wildcard + specific)", () => {
  const store = createStore();

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

  const typed = createTypedStore(store, schema);

  // wildcard: valueId union + new/old union
  {
    let ran = 0;
    typed.addValueListener(null, (_store, valueId, newValue, oldValue) => {
      ran++;
      expectTypeOf(valueId).toEqualTypeOf<
        "str" | "maybe" | "num" | "flag" | "obj" | "arr"
      >();
      expectTypeOf(newValue).toEqualTypeOf<
        string | null | number | boolean | { a: string } | string[]
      >();
      expectTypeOf(oldValue).toEqualTypeOf<
        string | null | number | boolean | { a: string } | string[]
      >();
    });

    typed.setValue("str", "x");
    expect(ran).toBe(1);
  }

  // specific: narrowed
  {
    let ran = 0;
    typed.addValueListener("str", (_store, valueId, newValue, oldValue) => {
      ran++;
      expectTypeOf(valueId).toEqualTypeOf<"str">();
      expectTypeOf(newValue).toEqualTypeOf<string>();
      expectTypeOf(oldValue).toEqualTypeOf<string>();
    });

    typed.setValue("str", "y");
    expect(ran).toBe(1);
  }
});
