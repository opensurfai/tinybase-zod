import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { createTypedStore } from "./store";

const schema = {
  tables: {
    t: z.object({
      s: z.string(),
      n: z.number(),
    }),
  },
  values: z.object({}),
} as const;

function setup() {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  store.setTables({});
  return { store, typed };
}

function seedRow(
  typed: ReturnType<typeof setup>["typed"],
  rowId: string,
  s = "seed",
  n = 0
) {
  typed.setRow("t", rowId, { s, n });
}

test("transaction batches row listeners for multiple changes to the same row", () => {
  {
    const { typed } = setup();
    seedRow(typed, "1");
    let calls = 0;
    typed.addRowListener("t", "1", () => {
      calls++;
    });

    typed.setCell("t", "1", "s", "a");
    typed.setCell("t", "1", "n", 1);
    expect(calls).toBe(2);
  }

  {
    const { typed } = setup();
    seedRow(typed, "1");
    let calls = 0;
    typed.addRowListener("t", "1", () => {
      calls++;
    });

    typed.transaction(() => {
      typed.setCell("t", "1", "s", "a");
      typed.setCell("t", "1", "n", 1);
    });

    expect(calls).toBe(1);
  }
});

test("transaction batches cell listeners for multiple changes to the same cell", () => {
  const { typed } = setup();
  seedRow(typed, "1");

  const events: Array<{
    newCell: unknown;
    oldCell: unknown;
    change: unknown;
  }> = [];

  typed.addCellListener(
    "t",
    "1",
    "s",
    (_store, tableId, rowId, cellId, newCell, oldCell, getCellChange) => {
      let change: unknown = undefined;
      if (typeof getCellChange === "function") {
        change = getCellChange(tableId, rowId, cellId);
      }
      events.push({ newCell, oldCell, change });
    }
  );

  typed.transaction(() => {
    typed.setCell("t", "1", "s", "a");
    typed.setCell("t", "1", "s", "b");
  });

  expect(events).toHaveLength(1);
  expect(events[0]?.oldCell).toBe("seed");
  expect(events[0]?.newCell).toBe("b");
  expect(events[0]?.change).toEqual([true, "seed", "b"]);
});

test("startTransaction/finishTransaction batches listeners like transaction()", () => {
  const { typed } = setup();
  seedRow(typed, "1");

  const events: Array<{ newCell: unknown; oldCell: unknown }> = [];
  typed.addCellListener(
    "t",
    "1",
    "s",
    (_store, _tableId, _rowId, _cellId, newCell, oldCell) => {
      events.push({ newCell, oldCell });
    }
  );

  typed.startTransaction();
  typed.setCell("t", "1", "s", "a");
  typed.setCell("t", "1", "s", "b");
  typed.finishTransaction();

  expect(events).toHaveLength(1);
  expect(events[0]?.oldCell).toBe("seed");
  expect(events[0]?.newCell).toBe("b");
});

test("finishTransaction(doRollback) and transaction(doRollback) can roll back changes", () => {
  {
    const { typed } = setup();
    seedRow(typed, "1", "orig", 0);

    typed.transaction(
      () => {
        typed.setCell("t", "1", "s", "new");
      },
      () => true
    );

    expect(typed.getCell("t", "1", "s")).toBe("orig");
  }

  {
    const { typed } = setup();
    seedRow(typed, "1", "orig", 0);

    typed.startTransaction();
    typed.setCell("t", "1", "s", "new");
    typed.finishTransaction(() => true);

    expect(typed.getCell("t", "1", "s")).toBe("orig");
  }
});

test("mutator listeners can safely mutate at end of a transaction", () => {
  const { typed } = setup();
  seedRow(typed, "1", "seed", 0);

  const order: string[] = [];
  typed.addTablesListener(() => {
    order.push("mutator");
    if (typed.getCell("t", "1", "n") !== 2) {
      typed.setCell("t", "1", "n", 2);
    }
  }, true);

  typed.addTablesListener(() => {
    order.push("non-mutator");
  });

  typed.transaction(() => {
    typed.setCell("t", "1", "s", "a");
  });

  expect(order[0]).toBe("mutator");
  expect(order.includes("non-mutator")).toBe(true);
  expect(typed.getCell("t", "1", "n")).toBe(2);
});
