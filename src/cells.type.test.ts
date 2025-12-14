import { expect, expectTypeOf, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const testSchema = z.object({
  string: z.string(),
  nullableString: z.string().nullable(),
  number: z.number(),
  enum: z.enum(["a", "b"]),
  object: json(
    z.object({
      a: z.string(),
    })
  ),
  array: json(z.array(z.string())),
});

const schema = {
  tables: {
    t: testSchema,
  },
  values: z.object({}),
} as const;

test("cell api types", () => {
  const store = createStore();
  const typed = createTypedStore(store, schema);

  // Rows are expected to be schema-valid; create a row before using setCell.
  typed.setRow("t", "1", {
    string: "",
    nullableString: null,
    number: 0,
    enum: "a",
    object: { a: "" },
    array: [],
  });

  // getCell return types
  expectTypeOf(typed.getCell("t", "1", "string")).toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf(typed.getCell("t", "1", "number")).toEqualTypeOf<
    number | undefined
  >();
  expectTypeOf(typed.getCell("t", "1", "enum")).toEqualTypeOf<
    "a" | "b" | undefined
  >();
  expectTypeOf(typed.getCell("t", "1", "object")).toEqualTypeOf<
    { a: string } | undefined
  >();
  expectTypeOf(typed.getCell("t", "1", "array")).toEqualTypeOf<
    string[] | undefined
  >();

  // setCell value types
  typed.setCell("t", "1", "string", "s");
  typed.setCell("t", "1", "nullableString", null);
  typed.setCell("t", "1", "number", 1);
  typed.setCell("t", "1", "enum", "a");
  typed.setCell("t", "1", "object", { a: "s" });
  typed.setCell("t", "1", "array", ["a"]);

  // setCell mapper inference
  typed.setCell("t", "1", "string", (c) => {
    expectTypeOf(c).toEqualTypeOf<string | undefined>();
    return `${c}s`;
  });

  typed.setCell("t", "1", "nullableString", (c) => {
    expectTypeOf(c).toEqualTypeOf<string | null | undefined>();
    return c ?? "s";
  });

  typed.setCell("t", "1", "array", (c) => {
    expectTypeOf(c).toEqualTypeOf<string[] | undefined>();
    return c ? [...c, "s"] : ["s"];
  });

  // Type errors (kept in dead-code so they don't execute at runtime)
  if (false) {
    // @ts-expect-error wrong cell type
    typed.setCell("t", "1", "string", 1);
    // @ts-expect-error wrong nullable cell type
    typed.setCell("t", "1", "nullableString", 1);
    // @ts-expect-error wrong enum value
    typed.setCell("t", "1", "enum", "c");
    // @ts-expect-error wrong object shape
    typed.setCell("t", "1", "object", "c");
  }
});

test("addCellListener types (wildcards)", () => {
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

  // tableId=null, cellId=null => newCell/oldCell are unions of all cells across all tables
  {
    let ran = 0;
    typed.setRow("a", "1", { s: "", n: 0 });
    typed.addCellListener(
      null,
      null,
      null,
      (_store, tableId, rowId, cellId, newCell, oldCell) => {
        ran++;
        expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
        expectTypeOf(rowId).toEqualTypeOf<string>();
        expectTypeOf(cellId).toEqualTypeOf<"s" | "n" | "flag" | "maybe">();
        expectTypeOf(newCell).toEqualTypeOf<
          string | number | boolean | null | undefined
        >();
        expectTypeOf(oldCell).toEqualTypeOf<
          string | number | boolean | null | undefined
        >();
      }
    );
    typed.setCell("a", "1", "s", "x");
    expect(ran).toBe(1);
  }

  // tableId=null, cellId="s" => union across tables that have "s" (here: string)
  {
    let ran = 0;
    typed.setRow("b", "1", { s: "", flag: false, maybe: null });
    typed.addCellListener(
      null,
      null,
      "s",
      (_store, tableId, _rowId, cellId, newCell, oldCell) => {
        ran++;
        expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
        expectTypeOf(cellId).toEqualTypeOf<"s">();
        expectTypeOf(newCell).toEqualTypeOf<string | undefined>();
        expectTypeOf(oldCell).toEqualTypeOf<string | undefined>();
      }
    );
    typed.setCell("b", "1", "s", "y");
    expect(ran).toBe(1);
  }

  // tableId="a", cellId=null => union of all cells in table "a"
  {
    let ran = 0;
    typed.setRow("a", "2", { s: "", n: 0 });
    typed.addCellListener(
      "a",
      null,
      null,
      (_store, tableId, _rowId, cellId, newCell, oldCell) => {
        ran++;
        expectTypeOf(tableId).toEqualTypeOf<"a">();
        expectTypeOf(cellId).toEqualTypeOf<"s" | "n">();
        expectTypeOf(newCell).toEqualTypeOf<string | number | undefined>();
        expectTypeOf(oldCell).toEqualTypeOf<string | number | undefined>();
      }
    );
    typed.setCell("a", "2", "n", 123);
    expect(ran).toBe(1);
  }

  // tableId=null, cellId="n" => only table "a" has it (number)
  {
    let ran = 0;
    typed.setRow("a", "3", { s: "", n: 0 });
    typed.addCellListener(
      null,
      null,
      "n",
      (_store, tableId, _rowId, cellId, newCell, oldCell) => {
        ran++;
        expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
        expectTypeOf(cellId).toEqualTypeOf<"n">();
        expectTypeOf(newCell).toEqualTypeOf<number | undefined>();
        expectTypeOf(oldCell).toEqualTypeOf<number | undefined>();
      }
    );
    typed.setCell("a", "3", "n", 1);
    expect(ran).toBe(1);
  }
});
