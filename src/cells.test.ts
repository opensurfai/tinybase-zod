import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const rowSchema = z.object({
  string: z.string(),
  nullableString: z.string().nullable(),
  number: z.number(),
  object: json(z.object({ a: z.string() })),
  array: json(z.array(z.string())),
});

const schema = {
  tables: {
    t: rowSchema,
  },
  values: z.object({}),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  store.setTables({ t: {} });
  return { store, typed };
}

test("getCell/setCell/delCell (primitive + complex encoding)", () => {
  const { store, typed } = setup();

  // missing
  expect(typed.getCell("t", "1", "string")).toBe(undefined);

  // create a complete row (rows are expected to be schema-valid)
  typed.setRow("t", "1", {
    string: "",
    nullableString: null,
    number: 0,
    object: { a: "" },
    array: [],
  });

  // primitive
  typed.setCell("t", "1", "string", "s");
  expect(typed.getCell("t", "1", "string")).toBe("s");
  expect(store.getCell("t", "1", "string")).toBe("s");

  // complex: object
  typed.setCell("t", "1", "object", { a: "x" });
  expect(typed.getCell("t", "1", "object")).toEqual({ a: "x" });
  expect(store.getCell("t", "1", "object")).toBe(JSON.stringify({ a: "x" }));

  // complex: array
  typed.setCell("t", "1", "array", ["a", "b"]);
  expect(typed.getCell("t", "1", "array")).toEqual(["a", "b"]);
  expect(store.getCell("t", "1", "array")).toBe(JSON.stringify(["a", "b"]));

  // delCell removes
  expect(typed.hasCell("t", "1", "string")).toBe(true);
  typed.delCell("t", "1", "string");
  expect(typed.hasCell("t", "1", "string")).toBe(false);
  expect(typed.getCell("t", "1", "string")).toBe(undefined);
});

test("setCell mapper receives decoded value and encodes return", () => {
  const { store, typed } = setup();

  // create a complete row
  typed.setRow("t", "1", {
    string: "",
    nullableString: null,
    number: 0,
    object: { a: "" },
    array: [],
  });

  // primitive mapper
  typed.setCell("t", "1", "string", "s");
  typed.setCell("t", "1", "string", (c) => `${c}s`);
  expect(typed.getCell("t", "1", "string")).toBe("ss");

  // cannot set a cell on a row that doesn't exist
  expect(() => typed.setCell("t", "2", "string", (c) => `${c}s`)).toThrow();

  // complex mapper: object should be encoded in underlying store
  typed.setCell("t", "1", "object", { a: "x" });
  typed.setCell("t", "1", "object", (c) => ({ a: `${c?.a}y` }));
  expect(typed.getCell("t", "1", "object")).toEqual({ a: "xy" });
  expect(store.getCell("t", "1", "object")).toBe(JSON.stringify({ a: "xy" }));

  // complex mapper: array should be encoded in underlying store
  typed.setCell("t", "1", "array", ["a"]);
  typed.setCell("t", "1", "array", (c) => (c ? [...c, "b"] : ["b"]));
  expect(typed.getCell("t", "1", "array")).toEqual(["a", "b"]);
  expect(store.getCell("t", "1", "array")).toBe(JSON.stringify(["a", "b"]));
});

test("hasCell / getCellIds / getTableCellIds", () => {
  const { typed } = setup();

  typed.setRow("t", "1", {
    string: "s",
    nullableString: null,
    number: 1,
    object: { a: "x" },
    array: [],
  });
  typed.setRow("t", "2", {
    string: "t2",
    nullableString: null,
    number: 2,
    object: { a: "y" },
    array: ["a"],
  });

  expect(typed.hasCell("t", "1", "string")).toBe(true);
  expect(typed.hasCell("t", "1", "object")).toBe(true);

  const cellIdsRow1 = typed.getCellIds("t", "1").slice().sort();
  expect(cellIdsRow1).toEqual([
    "array",
    "nullableString",
    "number",
    "object",
    "string",
  ]);

  const tableCellIds = typed.getTableCellIds("t").slice().sort();
  expect(tableCellIds).toEqual([
    "array",
    "nullableString",
    "number",
    "object",
    "string",
  ]);
});

test("addCellListener decodes new/old, supports wildcards, and mutator can update", () => {
  const { typed } = setup();

  // specific-cell listener gets decoded values
  let objectNew: unknown = "unset";
  let objectOld: unknown = "unset";
  typed.setRow("t", "1", {
    string: "",
    nullableString: null,
    number: 0,
    object: { a: "" },
    array: [],
  });
  typed.addCellListener(
    "t",
    "1",
    "object",
    (_store, _tableId, _rowId, _cellId, newCell, oldCell) => {
      objectNew = newCell;
      objectOld = oldCell;
    }
  );
  typed.setCell("t", "1", "object", { a: "x" });
  expect(objectOld).toEqual({ a: "" });
  expect(objectNew).toEqual({ a: "x" });

  // wildcard listener fires for any cell
  let wildcardRan = 0;
  typed.setRow("t", "9", {
    string: "",
    nullableString: null,
    number: 0,
    object: { a: "" },
    array: [],
  });
  const wildcardListenerId = typed.addCellListener(null, null, null, ((
    ...args: any[]
  ) => {
    const [_store, tableId, rowId, cellId, newCell, oldCell, getCellChange] =
      args;
    wildcardRan++;
    expect(tableId).toBe("t");
    expect(rowId).toBe("9");
    expect(cellId).toBe("string");
    expect(oldCell).toBe("");
    expect(newCell).toBe("hello");

    // if present, getCellChange should be decoded too
    if (getCellChange) {
      const [changed, oldV, newV] = getCellChange("t", "9", "string") as [
        boolean,
        unknown,
        unknown
      ];
      expect(changed).toBe(true);
      expect(oldV).toBe("");
      expect(newV).toBe("hello");
    }
  }) as any);
  typed.setCell("t", "9", "string", "hello");
  expect(wildcardRan).toBe(1);
  typed.delListener(wildcardListenerId);

  // mutator listener can update store; non-mutator sees updated value
  let seenNumber: unknown = "unset";
  typed.addCellListener(
    "t",
    "1",
    "string",
    (store, _tableId, _rowId, _cellId, newCell) => {
      if (newCell === "a") {
        store.setCell("t", "1", "number", 2);
      }
    },
    true
  );
  typed.addCellListener("t", "1", "string", (store) => {
    seenNumber = store.getCell("t", "1", "number");
  });

  typed.setCell("t", "1", "string", "a");
  expect(seenNumber).toBe(2);
});
