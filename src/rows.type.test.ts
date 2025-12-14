import { expect, expectTypeOf, test } from "bun:test";
import type { GetIdChanges } from "tinybase";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const rowSchema = z.object({
  string: z.string(),
  nullableString: z.string().nullable(),
  number: z.number(),
  enum: z.enum(["a", "b"]),
  object: json(z.object({ a: z.string() })),
  array: json(z.array(z.string())),
});

const schema = {
  tables: { t: rowSchema },
  values: z.object({}),
} as const;

test("row api types", () => {
  const store = createStore();
  const typed = createTypedStore(store, schema);

  // getRow return type
  expectTypeOf(typed.getRow("t", "1")).toEqualTypeOf<
    | {
        string: string;
        nullableString: string | null;
        number: number;
        enum: "a" | "b";
        object: { a: string };
        array: string[];
      }
    | undefined
  >();

  // setRow input type
  typed.setRow("t", "1", {
    string: "s",
    nullableString: null,
    number: 1,
    enum: "a",
    object: { a: "x" },
    array: ["a"],
  });

  // getRowIds / getSortedRowIds return types
  expectTypeOf(typed.getRowIds("t")).toEqualTypeOf<string[]>();
  expectTypeOf(typed.getSortedRowIds("t")).toEqualTypeOf<string[]>();
  expectTypeOf(typed.getSortedRowIds("t", "string")).toEqualTypeOf<string[]>();
  expectTypeOf(typed.getSortedRowIds({ tableId: "t" })).toEqualTypeOf<
    string[]
  >();

  // Type errors (kept in dead-code so they don't execute at runtime)
  if (false) {
    // @ts-expect-error unknown table
    typed.getRow("nope", "1");

    // @ts-expect-error missing required keys
    typed.setRow("t", "1", { string: "s" });

    typed.setRow("t", "1", {
      string: "s",
      nullableString: null,
      // @ts-expect-error wrong cell type inside row
      number: "1",
      enum: "a",
      object: { a: "x" },
      array: ["a"],
    });

    typed.setRow("t", "1", {
      string: "s",
      nullableString: null,
      number: 1,
      // @ts-expect-error wrong enum value
      enum: "c",
      object: { a: "x" },
      array: ["a"],
    });

    // @ts-expect-error getSortedRowIds cellId must be a cellId of table "t"
    typed.getSortedRowIds("t", "missing");
  }
});

test("getSortedRowIds types (cellId narrows per table)", () => {
  const store = createStore();

  const schema2 = {
    tables: {
      a: z.object({
        s: z.string(),
        n: z.number(),
      }),
      b: z.object({
        s: z.string(),
        flag: z.boolean(),
        maybe: z.string().nullable(),
      }),
    },
    values: z.object({}),
  } as const;

  const typed = createTypedStore(store, schema2);

  typed.getSortedRowIds("a", "s");
  typed.getSortedRowIds("a", "n");
  typed.getSortedRowIds("b", "s");
  typed.getSortedRowIds("b", "flag");
  typed.getSortedRowIds("b", "maybe");

  if (false) {
    // @ts-expect-error "n" does not exist on table "b"
    typed.getSortedRowIds("b", "n");

    // @ts-expect-error "flag" does not exist on table "a"
    typed.getSortedRowIds("a", "flag");
  }
});

test("addRowListener types (wildcards)", () => {
  const store = createStore();

  const schema2 = {
    tables: {
      a: z.object({
        s: z.string(),
        n: z.number(),
      }),
      b: z.object({
        s: z.string(),
        flag: z.boolean(),
        maybe: z.string().nullable(),
      }),
    },
    values: z.object({}),
  } as const;

  const typed = createTypedStore(store, schema2);

  // tableId=null, rowId=null => tableId is union of all tables
  {
    let ran = 0;
    typed.setRow("a", "1", { s: "", n: 0 });
    typed.addRowListener(null, null, (_store, tableId, rowId) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
      expectTypeOf(rowId).toEqualTypeOf<string>();
    });
    typed.setCell("a", "1", "s", "x");
    expect(ran).toBe(1);
  }

  // tableId="a", rowId=null => tableId narrows to "a"
  {
    let ran = 0;
    typed.setRow("a", "2", { s: "", n: 0 });
    typed.addRowListener("a", null, (_store, tableId, rowId) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a">();
      expectTypeOf(rowId).toEqualTypeOf<string>();
    });
    typed.setCell("a", "2", "n", 123);
    expect(ran).toBe(1);
  }

  // tableId=null, rowId="1" => tableId is union; rowId is Id (string)
  {
    let ran = 0;
    typed.setRow("b", "1", { s: "", flag: false, maybe: null });
    typed.addRowListener(null, "1", (_store, tableId, rowId) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
      expectTypeOf(rowId).toEqualTypeOf<string>();
    });
    typed.setCell("b", "1", "flag", true);
    expect(ran).toBe(1);
  }
});

test("addRowIdsListener types (wildcards)", () => {
  const store = createStore();

  const schema2 = {
    tables: {
      a: z.object({
        s: z.string(),
      }),
      b: z.object({
        s: z.string(),
      }),
    },
    values: z.object({}),
  } as const;

  const typed = createTypedStore(store, schema2);

  // tableId="a" => callback tableId narrows to "a"
  {
    let ran = 0;
    typed.addRowIdsListener("a", (_store, tableId, getIdChanges) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a">();
      expectTypeOf(getIdChanges).toEqualTypeOf<GetIdChanges | undefined>();
    });
    typed.setRow("a", "1", { s: "x" });
    expect(ran).toBe(1);
  }

  // tableId=null => callback tableId is union of all tables
  {
    let ran = 0;
    typed.addRowIdsListener(null, (_store, tableId, getIdChanges) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
      expectTypeOf(getIdChanges).toEqualTypeOf<GetIdChanges | undefined>();
    });
    typed.setRow("b", "2", { s: "y" });
    expect(ran).toBe(1);
  }
});
