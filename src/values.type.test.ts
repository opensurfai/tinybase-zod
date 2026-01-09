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

  // Seed runtime values so `getValue` doesn't throw for required schemas.
  // (These tests are about types, but Bun evaluates the expressions.)
  typed.setValue("str", "s");
  typed.setValue("maybe", null);
  typed.setValue("num", 1);
  typed.setValue("flag", true);
  typed.setValue("obj", { a: "x" });
  typed.setValue("arr", ["a"]);

  expectTypeOf(typed.getValue("str")).toEqualTypeOf<string>();
  expectTypeOf(typed.getValue("maybe")).toEqualTypeOf<
    string | null
  >();
  expectTypeOf(typed.getValue("num")).toEqualTypeOf<number>();
  expectTypeOf(typed.getValue("flag")).toEqualTypeOf<boolean>();
  expectTypeOf(typed.getValue("obj")).toEqualTypeOf<
    { a: string }
  >();
  expectTypeOf(typed.getValue("arr")).toEqualTypeOf<string[]>();

  // Re-set is fine; this keeps the rest of the test structure unchanged.
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
        string | null | number | boolean | { a: string } | string[] | undefined
      >();
      expectTypeOf(oldValue).toEqualTypeOf<
        string | null | number | boolean | { a: string } | string[] | undefined
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
      expectTypeOf(newValue).toEqualTypeOf<string | undefined>();
      expectTypeOf(oldValue).toEqualTypeOf<string | undefined>();
    });

    typed.setValue("str", "y");
    expect(ran).toBe(1);
  }
});
