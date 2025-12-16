import {
  type Cell,
  type CellOrUndefined,
  type DoRollback,
  type GetIdChanges,
  type Id,
  type IdOrNull,
  type Json,
  type Row,
  type SortedRowIdsArgs,
  type Store,
  type Table,
} from "tinybase";
import { z } from "zod";
import type { StoreSchema, TypedStore } from "./type";

export { json } from "./codec";

function isStorageCell(value: unknown): value is Cell {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function assertStorageCell(
  value: unknown,
  context: string
): asserts value is Cell | undefined {
  if (value === undefined) {
    return;
  }
  if (isStorageCell(value)) {
    return;
  }
  throw new Error(
    `Invalid encoded value for TinyBase storage at ${context}. ` +
      `Expected string|number|boolean|null (or undefined to delete), got ${typeof value}. ` +
      `Wrap non-primitive schemas with an explicit codec (e.g. json(schema), isoDate, bigintString).`
  );
}

function encodeRow(encoded: Record<string, unknown>, context: string): Row {
  const out: Row = {};
  for (const [cellId, cell] of Object.entries(encoded)) {
    assertStorageCell(cell, `${context}.${cellId}`);
    if (cell !== undefined) {
      out[cellId] = cell;
    }
  }
  return out;
}

function encodeTable(
  encoded: Record<string, Record<string, unknown>>,
  context: string
): Table {
  const out: Table = {};
  for (const [rowId, row] of Object.entries(encoded)) {
    out[rowId] = encodeRow(row, `${context}.${rowId}`);
  }
  return out;
}

export function createTypedStore<Schema extends StoreSchema>(
  store: Store,
  schema: Schema
) {
  const mapped = schema;

  function getRowSchema(tableId: Id) {
    const schema = mapped.tables[tableId as string];
    if (!schema) {
      throw new Error(`Unknown tableId: ${tableId}`);
    }
    return schema;
  }

  function getCellSchema(tableId: string, cellId: string) {
    const tableSchema = mapped.tables[tableId];
    if (!tableSchema) {
      throw new Error(`Unknown tableId: ${tableId}`);
    }
    const cellSchema = tableSchema.shape[cellId];
    if (!cellSchema) {
      throw new Error(`Unknown cellId: ${tableId}.${cellId}`);
    }
    return cellSchema;
  }

  function tryGetCellSchema(tableId: string, cellId: string) {
    return mapped.tables[tableId]?.shape?.[cellId];
  }

  function getValueSchema(valueId: string) {
    const valueSchema = mapped.values.shape[valueId];
    if (!valueSchema) {
      throw new Error(`Unknown valueId: ${valueId}`);
    }
    return valueSchema;
  }

  function tryGetValueSchema(valueId: string) {
    return mapped.values.shape?.[valueId];
  }

  function getTables() {
    const tables = store.getTables();
    const decoded: Record<string, unknown> = {};
    for (const [tableId, table] of Object.entries(tables)) {
      const schema = mapped.tables[tableId];
      if (!schema) {
        continue;
      }
      decoded[tableId] = z.record(z.string(), schema).decode(table);
    }
    return decoded;
  }

  function setTables(tables: Record<string, unknown>) {
    const encoded: Record<string, Table> = {};
    for (const [tableId, table] of Object.entries(tables)) {
      const schema = mapped.tables[tableId];
      if (!schema) {
        continue;
      }
      const encodedTable = z
        .record(z.string(), schema)
        .encode(table as any) as Record<string, Record<string, unknown>>;
      encoded[tableId] = encodeTable(encodedTable, `tables.${tableId}`);
    }
    store.setTables(encoded as any);
    return typedStore;
  }

  function delTables() {
    store.delTables();
    return typedStore;
  }

  function getTable(tableId: Id) {
    const table = store.getTable(tableId);
    const schema = getRowSchema(tableId);
    return z.record(z.string(), schema).decode(table);
  }

  function setTable(tableId: Id, table: Record<string, unknown>) {
    const schema = getRowSchema(tableId);
    const encodedTable = z
      .record(z.string(), schema)
      .encode(table as any) as Record<string, Record<string, unknown>>;
    store.setTable(tableId, encodeTable(encodedTable, `tables.${tableId}`));
    return typedStore;
  }

  function delTable(tableId: Id) {
    store.delTable(tableId);
    return typedStore;
  }

  function getRow(tableId: Id, rowId: Id) {
    const schema = getRowSchema(tableId);
    const row = store.getRow(tableId, rowId);
    if (row === undefined || Object.keys(row).length === 0) {
      return undefined;
    }
    return schema.decode(row);
  }

  function getRowOrThrow(tableId: Id, rowId: Id) {
    const row = getRow(tableId, rowId);
    if (row === undefined) {
      throw new Error(`Row not found: ${tableId}.${rowId}`);
    }
    return row;
  }

  function setRow(tableId: Id, rowId: Id, row: unknown) {
    const schema = getRowSchema(tableId);
    const encoded = schema.encode(row as any) as Record<string, unknown>;
    store.setRow(
      tableId,
      rowId,
      encodeRow(encoded, `tables.${tableId}.${rowId}`)
    );
    return typedStore;
  }

  function setPartialRow(tableId: Id, rowId: Id, update: Partial<unknown>) {
    const row = getRowOrThrow(tableId, rowId);
    setRow(tableId, rowId, { ...row, ...update });
  }

  function delRow(tableId: Id, rowId: Id) {
    store.delRow(tableId, rowId);
    return typedStore;
  }

  function getCell(tableId: Id, rowId: Id, cellId: Id) {
    const schema = getCellSchema(tableId, cellId);
    const cell = store.getCell(tableId, rowId, cellId);
    if (cell === undefined) {
      return undefined;
    }
    return schema.decode(cell);
  }

  function setCell(tableId: Id, rowId: Id, cellId: Id, cell: unknown) {
    if (!store.hasRow(tableId, rowId)) {
      throw new Error(
        `Cannot set cell on missing row: ${tableId}/${rowId}. Create the row with setRow() first.`
      );
    }
    const schema = getCellSchema(tableId, cellId);
    if (typeof cell === "function") {
      const mapCell = (encoded: CellOrUndefined) => {
        const decoded =
          encoded === undefined ? undefined : schema.decode(encoded);
        const nextDecoded = cell(decoded);
        if (nextDecoded === undefined) {
          return undefined;
        }
        const nextEncoded = schema.encode(nextDecoded);
        assertStorageCell(nextEncoded, `tables.${tableId}.${rowId}.${cellId}`);
        return nextEncoded as any;
      };
      store.setCell(tableId, rowId, cellId, mapCell as any);
      return typedStore;
    }
    const encoded = schema.encode(cell);
    assertStorageCell(encoded, `tables.${tableId}.${rowId}.${cellId}`);
    if (encoded === undefined) {
      store.delCell(tableId, rowId, cellId);
      return typedStore;
    }
    store.setCell(tableId, rowId, cellId, encoded as any);
    return typedStore;
  }

  function delCell(tableId: Id, rowId: Id, cellId: Id) {
    store.delCell(tableId, rowId, cellId);
    return typedStore;
  }

  function hasTables() {
    return store.hasTables();
  }

  function hasTable(tableId: Id) {
    return store.hasTable(tableId);
  }

  function hasTableCell(tableId: Id, cellId: Id) {
    return store.hasTableCell(tableId, cellId);
  }

  function hasRow(tableId: Id, rowId: Id) {
    return store.hasRow(tableId, rowId);
  }

  function hasCell(tableId: Id, rowId: Id, cellId: Id) {
    return store.hasCell(tableId, rowId, cellId);
  }

  function getTableIds() {
    return store.getTableIds();
  }

  function getRowIds(tableId: Id) {
    return store.getRowIds(tableId);
  }

  function getCellIds(tableId: Id, rowId: Id) {
    return store.getCellIds(tableId, rowId);
  }

  function getTableCellIds(tableId: Id) {
    return store.getTableCellIds(tableId);
  }

  function getSortedRowIds(
    tableIdOrArgs: Id | SortedRowIdsArgs,
    cellId?: Id,
    descending?: boolean,
    offset?: number,
    limit?: number
  ) {
    return typeof tableIdOrArgs === "string"
      ? store.getSortedRowIds(tableIdOrArgs, cellId, descending, offset, limit)
      : store.getSortedRowIds(tableIdOrArgs);
  }

  function transaction<Return>(actions: () => Return, doRollback?: DoRollback) {
    return store.transaction(actions, doRollback);
  }

  function startTransaction() {
    store.startTransaction();
    return typedStore;
  }

  function finishTransaction(doRollback?: DoRollback) {
    store.finishTransaction(doRollback);
    return typedStore;
  }

  function callListener(listenerId: Id) {
    store.callListener(listenerId);
    return typedStore;
  }

  function delListener(listenerId: Id) {
    store.delListener(listenerId);
    return typedStore;
  }

  function getJson(): Json {
    return store.getJson();
  }

  function setJson(tablesAndValuesJson: Json) {
    store.setJson(tablesAndValuesJson);
    return typedStore;
  }

  function getValues() {
    const values = store.getValues() as Record<string, unknown>;
    const decoded: Record<string, unknown> = {};
    for (const valueId of Object.keys(mapped.values.shape)) {
      if (Object.prototype.hasOwnProperty.call(values, valueId)) {
        const valueSchema = mapped.values.shape[valueId];
        decoded[valueId] = valueSchema.decode(values[valueId]);
      }
    }
    return decoded;
  }

  function setValues(values: Record<string, unknown>) {
    const encoded: Record<string, unknown> = {};
    for (const [valueId, value] of Object.entries(values)) {
      const valueSchema = tryGetValueSchema(valueId);
      if (!valueSchema) {
        continue;
      }
      const encodedValue = valueSchema.encode(value);
      assertStorageCell(encodedValue, `values.${valueId}`);
      if (encodedValue !== undefined) {
        encoded[valueId] = encodedValue;
      }
    }

    store.setValues(encoded as any);
    return typedStore;
  }

  function delValues() {
    store.delValues();
    return typedStore;
  }

  function getValue(valueId: Id) {
    const value = store.getValue(valueId);
    if (value === undefined) {
      return undefined;
    }
    const valueSchema = tryGetValueSchema(valueId);
    // If schema is present, ignore unknown value ids (Option A).
    if (!valueSchema) {
      return undefined;
    }
    return valueSchema.decode(value);
  }

  function setValue(valueId: Id, value: unknown) {
    const valueSchema = tryGetValueSchema(valueId);
    // If schema is present, ignore unknown value ids (Option A).
    if (!valueSchema) {
      return typedStore;
    }

    if (typeof value === "function") {
      const mapValue = (encoded: unknown) => {
        const decoded =
          encoded === undefined ? undefined : valueSchema.decode(encoded);
        const nextDecoded = value(decoded);
        if (nextDecoded === undefined) {
          return undefined;
        }
        const nextEncoded = valueSchema.encode(nextDecoded);
        assertStorageCell(nextEncoded, `values.${valueId}`);
        return nextEncoded as any;
      };
      store.setValue(valueId, mapValue as any);
      return typedStore;
    }

    const encoded = valueSchema.encode(value);
    assertStorageCell(encoded, `values.${valueId}`);
    if (encoded === undefined) {
      store.delValue(valueId);
      return typedStore;
    }
    store.setValue(valueId, encoded as any);
    return typedStore;
  }

  function delValue(valueId: Id) {
    store.delValue(valueId);
    return typedStore;
  }

  function hasValues() {
    return store.hasValues();
  }

  function hasValue(valueId: Id) {
    return store.hasValue(valueId);
  }

  function getValueIds() {
    const ids = store.getValueIds() as string[];
    if (!mapped.values) {
      return ids;
    }
    const known = new Set(Object.keys(mapped.values.shape));
    return ids.filter((id) => known.has(id));
  }

  function addValuesListener(
    listener: (store: TypedStore<Schema>) => void,
    mutator?: boolean
  ): Id {
    return store.addValuesListener((_store) => listener(typedStore), mutator);
  }

  function addValueListener(
    valueId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      valueId: Id,
      newValue: unknown,
      oldValue: unknown,
      getValueChange: unknown
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addValueListener(
      valueId,
      (_store, changedValueId, newValue, oldValue, getValueChange) => {
        const valueSchema = tryGetValueSchema(changedValueId);
        const decodedNewValue =
          newValue === undefined
            ? undefined
            : valueSchema
            ? valueSchema.decode(newValue)
            : newValue;
        const decodedOldValue =
          oldValue === undefined
            ? undefined
            : valueSchema
            ? valueSchema.decode(oldValue)
            : oldValue;

        let getTypedValueChange: any = undefined;
        if (getValueChange) {
          getTypedValueChange = (valueId: Id) => {
            const [changed, oldV, newV] = getValueChange(valueId);
            const schema = tryGetValueSchema(valueId);
            const decodedNewV =
              newV === undefined
                ? undefined
                : schema
                ? schema.decode(newV)
                : newV;
            const decodedOldV =
              oldV === undefined
                ? undefined
                : schema
                ? schema.decode(oldV)
                : oldV;
            return [changed, decodedOldV, decodedNewV];
          };
        }

        listener(
          typedStore,
          changedValueId,
          decodedNewValue,
          decodedOldValue,
          getTypedValueChange
        );
      },
      mutator
    );
  }

  function addValueIdsListener(
    listener: (
      store: TypedStore<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addValueIdsListener(
      (_store, getIdChanges) => listener(typedStore, getIdChanges),
      mutator
    );
  }

  function addHasValuesListener(
    listener: (store: TypedStore<Schema>, hasValues: boolean) => void,
    mutator?: boolean
  ): Id {
    return store.addHasValuesListener(
      (_store, hasValues) => listener(typedStore, hasValues),
      mutator
    );
  }

  function addHasValueListener(
    valueId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      valueId: Id,
      hasValue: boolean
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addHasValueListener(
      valueId,
      (_store, changedValueId, hasValue) =>
        listener(typedStore, changedValueId, hasValue),
      mutator
    );
  }

  function addTablesListener(
    listener: (store: TypedStore<Schema>) => void,
    mutator?: boolean
  ): Id {
    return store.addTablesListener((_store) => listener(typedStore), mutator);
  }

  function addTableListener(
    tableId: IdOrNull,
    listener: (store: TypedStore<Schema>, tableId: Id) => void,
    mutator?: boolean
  ): Id {
    return store.addTableListener(
      tableId,
      (_store, changedTableId) => listener(typedStore, changedTableId),
      mutator
    );
  }

  function addRowListener(
    tableId: IdOrNull,
    rowId: IdOrNull,
    listener: (store: TypedStore<Schema>, tableId: Id, rowId: Id) => void,
    mutator?: boolean
  ): Id {
    return store.addRowListener(
      tableId,
      rowId,
      (_store, changedTableId, changedRowId) =>
        listener(typedStore, changedTableId, changedRowId),
      mutator
    );
  }

  function addTableIdsListener(
    listener: (
      store: TypedStore<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addTableIdsListener(
      (_store, getIdChanges) => listener(typedStore, getIdChanges),
      mutator
    );
  }

  function addTableCellIdsListener(
    tableId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addTableCellIdsListener(
      tableId,
      (_store, changedTableId, getIdChanges) =>
        listener(typedStore, changedTableId, getIdChanges),
      mutator
    );
  }

  function addRowIdsListener(
    tableId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addRowIdsListener(
      tableId,
      (_store, changedTableId, getIdChanges) =>
        listener(typedStore, changedTableId, getIdChanges),
      mutator
    );
  }

  function addCellIdsListener(
    tableId: IdOrNull,
    rowId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      rowId: Id,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addCellIdsListener(
      tableId,
      rowId,
      (_store, changedTableId, changedRowId, getIdChanges) =>
        listener(typedStore, changedTableId, changedRowId, getIdChanges),
      mutator
    );
  }

  function addSortedRowIdsListener(...args: any[]): Id {
    // Signatures (TinyBase):
    // - (tableId, cellId, descending, offset, limit, listener, mutator?)
    // - (args, listener, mutator?)
    if (typeof args[0] === "object") {
      const [sortedArgs, listener, mutator] = args as [
        SortedRowIdsArgs,
        (
          store: TypedStore<Schema>,
          tableId: Id,
          cellId: Id | undefined,
          descending: boolean,
          offset: number,
          limit: number | undefined,
          sortedRowIds: Id[]
        ) => void,
        boolean | undefined
      ];
      return store.addSortedRowIdsListener(
        sortedArgs,
        (_store, tableId, cellId, descending, offset, limit, sortedRowIds) =>
          listener(
            typedStore,
            tableId,
            cellId,
            descending,
            offset,
            limit,
            sortedRowIds
          ),
        mutator
      );
    }

    const [tableId, cellId, descending, offset, limit, listener, mutator] =
      args as [
        Id,
        Id | undefined,
        boolean,
        number,
        number | undefined,
        (
          store: TypedStore<Schema>,
          tableId: Id,
          cellId: Id | undefined,
          descending: boolean,
          offset: number,
          limit: number | undefined,
          sortedRowIds: Id[]
        ) => void,
        boolean | undefined
      ];

    return store.addSortedRowIdsListener(
      tableId,
      cellId,
      descending,
      offset ?? 0,
      limit,
      (_store, tableId, cellId, descending, offset, limit, sortedRowIds) =>
        listener(
          typedStore,
          tableId,
          cellId,
          descending,
          offset,
          limit,
          sortedRowIds
        ),
      mutator
    );
  }

  function addHasTablesListener(
    listener: (store: TypedStore<Schema>, hasTables: boolean) => void,
    mutator?: boolean
  ): Id {
    return store.addHasTablesListener(
      (_store, hasTables) => listener(typedStore, hasTables),
      mutator
    );
  }

  function addHasTableListener(
    tableId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      hasTable: boolean
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addHasTableListener(
      tableId,
      (_store, changedTableId, hasTable) =>
        listener(typedStore, changedTableId, hasTable),
      mutator
    );
  }

  function addHasRowListener(
    tableId: IdOrNull,
    rowId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      rowId: Id,
      hasRow: boolean
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addHasRowListener(
      tableId,
      rowId,
      (_store, changedTableId, changedRowId, hasRow) =>
        listener(typedStore, changedTableId, changedRowId, hasRow),
      mutator
    );
  }

  function addHasCellListener(
    tableId: IdOrNull,
    rowId: IdOrNull,
    cellId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      rowId: Id,
      cellId: Id,
      hasCell: boolean
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addHasCellListener(
      tableId,
      rowId,
      cellId,
      (_store, changedTableId, changedRowId, changedCellId, hasCell) =>
        listener(
          typedStore,
          changedTableId,
          changedRowId,
          changedCellId,
          hasCell
        ),
      mutator
    );
  }

  function addCellListener(
    tableId: IdOrNull,
    rowId: IdOrNull,
    cellId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: Id,
      rowId: Id,
      cellId: Id,
      newCell: unknown,
      oldCell: unknown,
      getCellChange: unknown
    ) => void,
    mutator?: boolean
  ): Id {
    return store.addCellListener(
      tableId,
      rowId,
      cellId,
      (_store, tableId, rowId, cellId, newCell, oldCell, getCellChange) => {
        const cellSchema = tryGetCellSchema(tableId, cellId);
        const decodedNewCell =
          newCell === undefined
            ? undefined
            : cellSchema
            ? cellSchema.decode(newCell)
            : newCell;
        const decodedOldCell =
          oldCell === undefined
            ? undefined
            : cellSchema
            ? cellSchema.decode(oldCell)
            : oldCell;
        let getTypedCellChange: any = undefined;
        if (getCellChange) {
          getTypedCellChange = (tableId: Id, rowId: Id, cellId: Id) => {
            const [changed, oldCell, newCell] = getCellChange(
              tableId,
              rowId,
              cellId
            );
            const schema = tryGetCellSchema(tableId, cellId);
            const decodedNewCell =
              newCell === undefined
                ? undefined
                : schema
                ? schema.decode(newCell)
                : newCell;
            const decodedOldCell =
              oldCell === undefined
                ? undefined
                : schema
                ? schema.decode(oldCell)
                : oldCell;
            return [changed, decodedOldCell, decodedNewCell];
          };
        }
        listener(
          typedStore,
          tableId,
          rowId,
          cellId,
          decodedNewCell,
          decodedOldCell,
          getTypedCellChange
        );
      },
      mutator
    );
  }

  const typedStore = {
    getTables,
    setTables,
    delTables,
    getTable,
    setTable,
    delTable,
    getRow,
    getRowOrThrow,
    setRow,
    setPartialRow,
    delRow,
    getCell,
    setCell,
    delCell,
    hasTables,
    hasTable,
    hasTableCell,
    hasRow,
    hasCell,
    getTableIds,
    getRowIds,
    getCellIds,
    getTableCellIds,
    getSortedRowIds,
    transaction,
    startTransaction,
    finishTransaction,
    callListener,
    delListener,
    getJson,
    setJson,
    getValues,
    setValues,
    delValues,
    getValue,
    setValue,
    delValue,
    hasValues,
    hasValue,
    getValueIds,
    addValuesListener,
    addValueListener,
    addValueIdsListener,
    addHasValuesListener,
    addHasValueListener,
    addTablesListener,
    addTableListener,
    addTableIdsListener,
    addTableCellIdsListener,
    addRowIdsListener,
    addCellIdsListener,
    addSortedRowIdsListener,
    addHasTablesListener,
    addHasTableListener,
    addRowListener,
    addHasRowListener,
    addHasCellListener,
    addCellListener,
  } as unknown as TypedStore<Schema>;

  return typedStore;
}
