import { useMemo } from "react";
import { createTypedStore, type StoreSchema } from "tinybase-zod";
import * as tinybase from "tinybase/ui-react";
import type { CellIdOf, TableIdOf, ValueIdOf } from "./type";

export function getTypedHooks<Schema extends StoreSchema>(schema: Schema) {
  function useStore() {
    const store = tinybase.useStore();
    if (!store) {
      throw new Error("No store");
    }
    return useMemo(() => createTypedStore(store, schema), [store]);
  }

  function useValue<ValueId extends ValueIdOf<Schema>>(valueId: ValueId) {
    const value = tinybase.useValue(valueId);
    const typed = useStore();
    return useMemo(() => typed.getValue(valueId), [typed, value]);
  }

  function useValues() {
    const values = tinybase.useValues();
    const typed = useStore();
    return useMemo(() => typed.getValues(), [typed, values]);
  }

  function useTable<TableId extends TableIdOf<Schema>>(tableId: TableId) {
    const table = tinybase.useTable(tableId);
    const typed = useStore();
    return useMemo(() => typed.getTable(tableId), [typed, tableId, table]);
  }

  function useRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: string
  ) {
    const row = tinybase.useRow(tableId, rowId);
    const typed = useStore();
    return useMemo(
      () => typed.getRow(tableId, rowId),
      [typed, tableId, rowId, row]
    );
  }

  function useCell<
    TableId extends TableIdOf<Schema>,
    CellId extends CellIdOf<Schema, TableId>
  >(tableId: TableId, rowId: string, cellId: CellId) {
    const cell = tinybase.useCell(tableId, rowId, cellId);
    const typed = useStore();
    return useMemo(
      () => typed.getCell(tableId, rowId, cellId),
      [typed, tableId, rowId, cellId, cell]
    );
  }

  return {
    useStore,
    useCell,
    useRow,
    useTable,
    useValue,
    useValues,
  } as const;
}
