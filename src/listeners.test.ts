import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const rowSchemaT = z.object({
  s: z.string(),
  n: z.number(),
  o: json(z.object({ s: z.string() })),
});

const rowSchemaU = z.object({
  s: z.string(),
});

const schema = {
  tables: {
    t: rowSchemaT,
    u: rowSchemaU,
  },
  values: z.object({
    vStr: z.string(),
    vNum: z.number(),
    vObj: json(z.object({ s: z.string() })),
    vArr: json(z.array(z.string())),
  }),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  store.setTables({});
  return { store, typed };
}

function seedT(
  typed: ReturnType<typeof setup>["typed"],
  rowId: string,
  s = "seed"
) {
  typed.setRow("t", rowId, { s, n: 0, o: { s: "o" } });
}

function seedU(
  typed: ReturnType<typeof setup>["typed"],
  rowId: string,
  s = "seed"
) {
  typed.setRow("u", rowId, { s });
}

test("addTablesListener fires on any table data change", () => {
  const { typed } = setup();
  seedT(typed, "1");
  seedU(typed, "1");

  let calls = 0;
  typed.addTablesListener((store) => {
    expect(store).toBe(typed);
    calls++;
  });

  typed.setCell("t", "1", "s", "a");
  typed.setCell("u", "1", "s", "b");

  expect(calls).toBe(2);
});

test("addTablesListener mutators run before non-mutators", () => {
  const { typed } = setup();
  seedT(typed, "1");

  const order: string[] = [];
  typed.addTablesListener(() => order.push("mutator"), true);
  typed.addTablesListener(() => order.push("non-mutator"));

  typed.setCell("t", "1", "s", "a");

  expect(order).toEqual(["mutator", "non-mutator"]);
});

test("addTableListener supports specific table and wildcard tableId=null", () => {
  const { typed } = setup();
  seedT(typed, "1");
  seedU(typed, "1");
  seedT(typed, "2");
  seedU(typed, "2");

  const specific: string[] = [];
  typed.addTableListener("t", (_store, tableId) => specific.push(tableId));

  typed.setCell("t", "1", "s", "a");
  typed.setCell("u", "1", "s", "b");
  expect(specific).toEqual(["t"]);

  const wildcard: string[] = [];
  typed.addTableListener(null, (_store, tableId) => wildcard.push(tableId));

  typed.setCell("t", "2", "s", "c");
  typed.setCell("u", "2", "s", "d");
  expect(wildcard).toEqual(["t", "u"]);
});

test("addRowListener supports specific row and wildcards", () => {
  const { typed } = setup();
  seedT(typed, "1");
  seedT(typed, "2");
  seedU(typed, "1");
  seedT(typed, "3");
  seedT(typed, "4");
  seedT(typed, "5");
  seedU(typed, "2");

  const specific: Array<[string, string]> = [];
  typed.addRowListener("t", "1", (_store, tableId, rowId) =>
    specific.push([tableId, rowId])
  );

  typed.setCell("t", "1", "s", "a");
  typed.setCell("t", "2", "s", "b");
  typed.setCell("u", "1", "s", "c");
  expect(specific).toEqual([["t", "1"]]);

  const rowWildcard: Array<[string, string]> = [];
  typed.addRowListener("t", null, (_store, tableId, rowId) =>
    rowWildcard.push([tableId, rowId])
  );

  typed.setCell("t", "3", "s", "d");
  typed.setCell("t", "4", "s", "e");
  expect(rowWildcard).toEqual([
    ["t", "3"],
    ["t", "4"],
  ]);

  const anyRow: Array<[string, string]> = [];
  typed.addRowListener(null, null, (_store, tableId, rowId) =>
    anyRow.push([tableId, rowId])
  );

  typed.setCell("t", "5", "s", "f");
  typed.setCell("u", "2", "s", "g");
  expect(anyRow).toEqual([
    ["t", "5"],
    ["u", "2"],
  ]);
});

test("addHasTablesListener fires when hasTables toggles", () => {
  const { typed } = setup();

  const events: boolean[] = [];
  typed.addHasTablesListener((_store, hasTables) => events.push(hasTables));

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.delTables();

  expect(events).toEqual([true, false]);
});

test("addHasTableListener supports specific table and wildcard tableId=null", () => {
  const { typed } = setup();

  const specific: Array<[string, boolean]> = [];
  typed.addHasTableListener("t", (_store, tableId, hasTable) =>
    specific.push([tableId, hasTable])
  );

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.delTable("t");
  expect(specific).toEqual([
    ["t", true],
    ["t", false],
  ]);

  const wildcard: Array<[string, boolean]> = [];
  typed.addHasTableListener(null, (_store, tableId, hasTable) =>
    wildcard.push([tableId, hasTable])
  );

  typed.setRow("t", "2", { s: "b", n: 0, o: { s: "o" } });
  typed.setRow("u", "1", { s: "c" });
  typed.delTable("u");
  typed.delTable("t");

  expect(wildcard).toEqual([
    ["t", true],
    ["u", true],
    ["u", false],
    ["t", false],
  ]);
});

test("addHasRowListener supports specific row and wildcards", () => {
  const { typed } = setup();

  const specific: Array<[string, string, boolean]> = [];
  typed.addHasRowListener("t", "1", (_store, tableId, rowId, hasRow) =>
    specific.push([tableId, rowId, hasRow])
  );

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.delRow("t", "1");
  expect(specific).toEqual([
    ["t", "1", true],
    ["t", "1", false],
  ]);

  const rowWildcard: Array<[string, string, boolean]> = [];
  typed.addHasRowListener("t", null, (_store, tableId, rowId, hasRow) =>
    rowWildcard.push([tableId, rowId, hasRow])
  );

  typed.setRow("t", "2", { s: "b", n: 0, o: { s: "o" } });
  typed.setRow("t", "3", { s: "c", n: 0, o: { s: "o" } });
  expect(rowWildcard).toEqual([
    ["t", "2", true],
    ["t", "3", true],
  ]);

  const anyRow: Array<[string, string, boolean]> = [];
  typed.addHasRowListener(null, null, (_store, tableId, rowId, hasRow) =>
    anyRow.push([tableId, rowId, hasRow])
  );

  typed.setRow("u", "1", { s: "d" });
  typed.delRow("u", "1");
  expect(anyRow).toEqual([
    ["u", "1", true],
    ["u", "1", false],
  ]);
});

test("addHasCellListener supports specific cell and wildcards", () => {
  const { typed } = setup();

  const specific: Array<[string, string, string, boolean]> = [];
  typed.addHasCellListener(
    "t",
    "1",
    "s",
    (_store, tableId, rowId, cellId, has) =>
      specific.push([tableId, rowId, cellId, has])
  );

  // Create a complete row; should trigger hasCell=true for the watched cell.
  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.delCell("t", "1", "s");
  expect(specific).toEqual([
    ["t", "1", "s", true],
    ["t", "1", "s", false],
  ]);

  const anyCell: Array<[string, string, string, boolean]> = [];
  typed.addHasCellListener(
    null,
    null,
    null,
    (_store, tableId, rowId, cellId, has) =>
      anyCell.push([tableId, rowId, cellId, has])
  );

  typed.setRow("u", "1", { s: "b" });
  typed.delCell("u", "1", "s");

  expect(anyCell).toEqual([
    ["u", "1", "s", true],
    ["u", "1", "s", false],
  ]);
});

test("addTableIdsListener provides GetIdChanges for added/removed table ids", () => {
  const { typed } = setup();

  const changes: Array<Record<string, 1 | -1>> = [];
  typed.addTableIdsListener((_store, getIdChanges) => {
    expect(getIdChanges).toBeTypeOf("function");
    changes.push(getIdChanges!());
  });

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.setRow("u", "1", { s: "b" });
  typed.delTable("t");

  expect(changes).toEqual([{ t: 1 }, { u: 1 }, { t: -1 }]);
});

test("addRowIdsListener provides GetIdChanges for added/removed row ids", () => {
  const { typed } = setup();

  const changes: Array<[string, Record<string, 1 | -1>]> = [];
  typed.addRowIdsListener("t", (_store, tableId, getIdChanges) => {
    expect(getIdChanges).toBeTypeOf("function");
    changes.push([tableId, getIdChanges!()]);
  });

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  typed.setRow("t", "2", { s: "b", n: 0, o: { s: "o" } });
  typed.delRow("t", "1");

  expect(changes).toEqual([
    ["t", { "1": 1 }],
    ["t", { "2": 1 }],
    ["t", { "1": -1 }],
  ]);
});

test("addCellIdsListener provides GetIdChanges for added/removed cell ids", () => {
  const { typed } = setup();
  // Seed a row, then remove cells so we can observe adds.
  typed.setRow("t", "1", { s: "seed", n: 0, o: { s: "o" } });
  typed.delCell("t", "1", "s");
  typed.delCell("t", "1", "n");

  const changes: Array<[string, string, Record<string, 1 | -1>]> = [];
  typed.addCellIdsListener("t", "1", (_store, tableId, rowId, getIdChanges) => {
    expect(getIdChanges).toBeTypeOf("function");
    changes.push([tableId, rowId, getIdChanges!()]);
  });

  typed.setCell("t", "1", "n", 1);
  typed.setCell("t", "1", "s", "a");
  typed.delCell("t", "1", "s");

  expect(changes).toEqual([
    ["t", "1", { n: 1 }],
    ["t", "1", { s: 1 }],
    ["t", "1", { s: -1 }],
  ]);
});

test("addTableCellIdsListener provides GetIdChanges for added/removed table cell ids", () => {
  const { typed } = setup();
  // Seed a row, then remove cells so we can observe adds.
  typed.setRow("t", "1", { s: "seed", n: 0, o: { s: "o" } });
  typed.delCell("t", "1", "s");
  typed.delCell("t", "1", "n");

  const changes: Array<[string, Record<string, 1 | -1>]> = [];
  typed.addTableCellIdsListener("t", (_store, tableId, getIdChanges) => {
    expect(getIdChanges).toBeTypeOf("function");
    changes.push([tableId, getIdChanges!()]);
  });

  typed.setCell("t", "1", "n", 1);
  typed.setCell("t", "1", "s", "a");
  typed.delCell("t", "1", "s");

  expect(changes).toEqual([
    ["t", { n: 1 }],
    ["t", { s: 1 }],
    ["t", { s: -1 }],
  ]);
});

test("addSortedRowIdsListener works with both call signatures", () => {
  const { typed } = setup();
  seedT(typed, "1", "a");
  seedT(typed, "2", "b");
  seedT(typed, "3", "c");

  const positional: string[][] = [];
  typed.addSortedRowIdsListener(
    "t",
    "n",
    false,
    0,
    undefined,
    (_store, tableId, cellId, descending, offset, limit, sortedRowIds) => {
      expect(tableId).toBe("t");
      expect(cellId).toBe("n");
      expect(descending).toBe(false);
      expect(offset).toBe(0);
      expect(limit).toBeUndefined();
      positional.push(sortedRowIds as string[]);
    }
  );

  typed.setCell("t", "1", "n", 2);
  typed.setCell("t", "2", "n", 1);
  typed.setCell("t", "3", "n", 3);

  expect(positional.at(-1)).toEqual(["2", "1", "3"]);

  const objectForm: string[][] = [];
  typed.addSortedRowIdsListener(
    { tableId: "t", cellId: "n", descending: true, offset: 0 },
    (_store, tableId, cellId, descending, offset, limit, sortedRowIds) => {
      expect(tableId).toBe("t");
      expect(cellId).toBe("n" as any);
      expect(descending).toBe(true);
      expect(offset).toBe(0);
      expect(limit).toBeUndefined();
      objectForm.push(sortedRowIds as string[]);
    }
  );

  typed.setCell("t", "2", "n", 10);
  expect(objectForm.at(-1)).toEqual(["2", "3", "1"]);
});

test("addCellListener decodes complex cells and getCellChange results", () => {
  const { typed } = setup();
  seedT(typed, "1");

  const events: Array<{
    newCell: unknown;
    oldCell: unknown;
    change: unknown;
  }> = [];

  typed.addCellListener(
    "t",
    "1",
    "o",
    (_store, tableId, rowId, cellId, newCell, oldCell, getCellChange) => {
      expect(tableId).toBe("t");
      expect(rowId).toBe("1");
      expect(cellId).toBe("o");
      let change: unknown = undefined;
      if (typeof getCellChange === "function") {
        change = getCellChange(tableId, rowId, cellId);
      }
      events.push({ newCell, oldCell, change });
    }
  );

  typed.setCell("t", "1", "o", { s: "a" });
  typed.setCell("t", "1", "o", { s: "b" });

  expect(events[0]?.oldCell).toEqual({ s: "o" });
  expect(events[0]?.newCell).toEqual({ s: "a" });
  expect(events[1]?.oldCell).toEqual({ s: "a" });
  expect(events[1]?.newCell).toEqual({ s: "b" });

  // getCellChange should return decoded old/new values for the cell.
  expect(events[1]?.change).toEqual([true, { s: "a" }, { s: "b" }]);
});

test("delListener stops future calls; callListener forces a listener to run", () => {
  const { typed } = setup();

  let calls = 0;
  const listenerId = typed.addTablesListener(() => {
    calls++;
  });

  typed.callListener(listenerId);
  expect(calls).toBe(1);

  typed.setRow("t", "1", { s: "a", n: 0, o: { s: "o" } });
  expect(calls).toBe(2);

  typed.delListener(listenerId);
  typed.setRow("t", "2", { s: "b", n: 0, o: { s: "o" } });
  expect(calls).toBe(2);
});

test("Values listeners: addValuesListener fires and respects mutator ordering", () => {
  const { typed } = setup();

  let calls = 0;
  typed.addValuesListener((store) => {
    expect(store).toBe(typed);
    calls++;
  });

  typed.setValue("vStr", "a");
  typed.setValue("vNum", 1);
  expect(calls).toBe(2);

  const order: string[] = [];
  typed.addValuesListener(() => order.push("mutator"), true);
  typed.addValuesListener(() => order.push("non-mutator"));
  typed.setValue("vStr", "b");
  expect(order).toEqual(["mutator", "non-mutator"]);
});

test("Values listeners: addValueListener (specific + wildcard) decodes values and getValueChange", () => {
  const { store, typed } = setup();

  const specific: Array<{ newV: unknown; oldV: unknown; change: unknown }> = [];
  typed.addValueListener(
    "vObj",
    // @ts-ignore
    (_store, valueId, newValue, oldValue, getValueChange) => {
      expect(valueId).toBe("vObj");
      let change: unknown = undefined;
      if (typeof getValueChange === "function") {
        change = getValueChange(valueId);
      }
      specific.push({ newV: newValue, oldV: oldValue, change });
    }
  );

  typed.setValue("vObj", { s: "a" });
  typed.setValue("vObj", { s: "b" });

  // Underlying store should hold JSON strings for complex values.
  expect(store.getValue("vObj")).toBe(JSON.stringify({ s: "b" }));

  expect(specific[0]?.oldV).toBeUndefined();
  expect(specific[0]?.newV).toEqual({ s: "a" });
  expect(specific[1]?.oldV).toEqual({ s: "a" });
  expect(specific[1]?.newV).toEqual({ s: "b" });
  expect(specific[1]?.change).toEqual([true, { s: "a" }, { s: "b" }]);

  const wildcard: Array<[string, unknown, unknown]> = [];
  typed.addValueListener(null, ((
    _store: unknown,
    valueId: string,
    newValue: unknown,
    oldValue: unknown
  ) => {
    wildcard.push([valueId, newValue, oldValue]);
  }) as any);

  typed.setValue("vStr", "x");
  typed.setValue("vArr", ["a", "b"]);

  expect(wildcard).toEqual([
    ["vStr", "x", undefined],
    ["vArr", ["a", "b"], undefined],
  ]);
});

test("Values listeners: addHasValuesListener / addHasValueListener / addValueIdsListener", () => {
  const { typed } = setup();

  const hasValuesEvents: boolean[] = [];
  typed.addHasValuesListener((_store, hasValues) =>
    hasValuesEvents.push(hasValues)
  );
  typed.setValue("vStr", "a");
  typed.delValues();
  expect(hasValuesEvents).toEqual([true, false]);

  const hasValueEvents: Array<[string, boolean]> = [];
  typed.addHasValueListener("vStr", (_store, valueId, hasValue) =>
    hasValueEvents.push([valueId, hasValue])
  );
  typed.setValue("vStr", "b");
  typed.delValue("vStr");
  expect(hasValueEvents).toEqual([
    ["vStr", true],
    ["vStr", false],
  ]);

  const idChanges: Array<Record<string, 1 | -1>> = [];
  typed.addValueIdsListener((_store, getIdChanges) => {
    expect(getIdChanges).toBeTypeOf("function");
    idChanges.push(getIdChanges!());
  });
  typed.setValue("vNum", 1);
  typed.setValue("vArr", ["x"]);
  typed.delValue("vNum");
  expect(idChanges).toEqual([{ vNum: 1 }, { vArr: 1 }, { vNum: -1 }]);
});

test("Values listeners: callListener/delListener works with value listener ids", () => {
  const { typed } = setup();

  let calls = 0;
  const listenerId = typed.addValuesListener(() => {
    calls++;
  });

  typed.callListener(listenerId);
  expect(calls).toBe(1);

  typed.setValue("vStr", "a");
  expect(calls).toBe(2);

  typed.delListener(listenerId);
  typed.setValue("vStr", "b");
  expect(calls).toBe(2);
});
