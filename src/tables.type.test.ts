import { expect, expectTypeOf, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { createTypedStore } from "./store";

/**
 * Type test suite: Tables (expectTypeOf)
 *
 * Focus:
 * - getTables/setTables typing (Partial of schema tables)
 * - getTable/getTableIds typing
 * - setTable input typing (row shape)
 * - delTables/delTable chainability
 * - addTablesListener/addTableListener callback typing (specific + wildcard)
 */

const rowA = z.object({
  s: z.string(),
  n: z.number(),
});

const rowB = z.object({
  flag: z.boolean(),
  maybe: z.string().nullable(),
});

const schema = {
  tables: {
    a: rowA,
    b: rowB,
  },
  values: z.object({}),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  return { store, typed };
}

test("table api types", () => {
  const { typed } = setup();

  // getTables return type
  expectTypeOf(typed.getTables()).toEqualTypeOf<
    Partial<{
      a: Record<string, { s: string; n: number }>;
      b: Record<string, { flag: boolean; maybe: string | null }>;
    }>
  >();

  // setTables accepts Partial<TablesOf<Schema>>
  typed.setTables({
    a: {
      "1": { s: "x", n: 1 },
    },
  });
  typed.setTables({
    b: {
      "1": { flag: true, maybe: null },
    },
  });
  typed.setTables({
    a: {},
    b: {},
  });

  // delTables is chainable
  expectTypeOf(typed.delTables()).toEqualTypeOf<typeof typed>();

  // getTable typing (per-table row shape)
  expectTypeOf(typed.getTable("a")).toEqualTypeOf<
    Record<string, { s: string; n: number }>
  >();
  expectTypeOf(typed.getTable("b")).toEqualTypeOf<
    Record<string, { flag: boolean; maybe: string | null }>
  >();

  // setTable input type
  typed.setTable("a", { "1": { s: "x", n: 1 } });
  typed.setTable("b", { "1": { flag: false, maybe: "m" } });

  // delTable is chainable
  expectTypeOf(typed.delTable("a")).toEqualTypeOf<typeof typed>();

  // getTableIds typing
  expectTypeOf(typed.getTableIds()).toEqualTypeOf<Array<"a" | "b">>();

  // Type errors (kept in dead-code so they don't execute at runtime)
  if (false) {
    // @ts-expect-error unknown table id
    typed.getTable("nope");

    // @ts-expect-error unknown table id
    typed.delTable("nope");

    // @ts-expect-error unknown table id
    typed.setTable("nope", {});

    // @ts-expect-error setTables rejects unknown table id (excess property)
    typed.setTables({ nope: {} });

    typed.setTables({
      a: {
        // @ts-expect-error missing required key "n" in row for table "a"
        "1": { s: "x" },
      },
    });

    typed.setTables({
      a: {
        "1": {
          s: "x",
          // @ts-expect-error wrong type for "n"
          n: "1",
        },
      },
    });

    typed.setTable("b", {
      "1": {
        flag: true,
        // @ts-expect-error wrong type for nullable cell
        maybe: 123,
      },
    });
  }
});

test("addTablesListener/addTableListener types (specific + wildcard)", () => {
  // addTablesListener: callback gets the typed store
  {
    const { typed } = setup();
    let ran = 0;
    typed.addTablesListener((store) => {
      ran++;
      expectTypeOf(store).toEqualTypeOf<typeof typed>();
    });
    typed.setRow("a", "1", { s: "x", n: 1 });
    expect(ran).toBe(1);
  }

  // addTableListener: tableId=null => callback tableId is union of schema table ids
  {
    const { typed } = setup();
    let ran = 0;
    typed.addTableListener(null, (_store, tableId) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a" | "b">();
    });
    typed.setRow("a", "1", { s: "x", n: 1 });
    expect(ran).toBe(1);
  }

  // addTableListener: tableId="a" => callback tableId narrows to "a"
  {
    const { typed } = setup();
    let ran = 0;
    typed.addTableListener("a", (_store, tableId) => {
      ran++;
      expectTypeOf(tableId).toEqualTypeOf<"a">();
    });
    typed.setRow("a", "1", { s: "x", n: 1 });
    typed.setRow("b", "1", { flag: true, maybe: null });
    expect(ran).toBe(1);
  }

  if (false) {
    const { typed } = setup();
    // @ts-expect-error unknown table id
    typed.addTableListener("nope", () => {});
  }
});
