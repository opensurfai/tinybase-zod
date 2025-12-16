import type {
  DoRollback,
  GetIdChanges,
  Id,
  IdOrNull,
  Json,
  SortedRowIdsArgs,
} from "tinybase";
import z from "zod";

type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type StoreTablesSchema = Record<string, z.ZodObject>;
export type StoreValuesSchema = z.ZodObject;

export type StoreSchema = {
  tables: StoreTablesSchema;
  values: StoreValuesSchema;
};

export type TableIdOf<Schema extends StoreSchema> = Extract<
  keyof Schema["tables"],
  string
>;

export type CellIdOf<
  Schema extends StoreSchema,
  TableId extends TableIdOf<Schema>
> = Extract<keyof RowOf<Schema, TableId>, string>;

type TableIdOfOrNull<Schema extends StoreSchema> = TableIdOf<Schema> | null;

type KeysOfUnion<T> = T extends any ? keyof T : never;

type CellIdOrUnionOf<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>
> = Extract<
  KeysOfUnion<
    RowOf<
      Schema,
      TableIdOrNull extends TableIdOf<Schema>
        ? TableIdOrNull
        : TableIdOf<Schema>
    >
  >,
  string
>;

type CellIdOrUnionOfOrNull<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>
> = CellIdOrUnionOf<Schema, TableIdOrNull> | null;

type ResolveTableId<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>
> = TableIdOrNull extends TableIdOf<Schema> ? TableIdOrNull : TableIdOf<Schema>;

type ResolveCellId<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>,
  CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
> = CellIdOrNull extends null
  ? CellIdOrUnionOf<Schema, TableIdOrNull>
  : CellIdOrNull;

type CellOf<
  Schema extends StoreSchema,
  TableId extends TableIdOf<Schema>,
  CellId extends CellIdOf<Schema, TableId>
> = RowOf<Schema, TableId>[CellId];

type RowOf<
  Schema extends StoreSchema,
  TableId extends TableIdOf<Schema>
> = z.infer<Schema["tables"][TableId]>;

type TableOf<
  Schema extends StoreSchema,
  TableId extends TableIdOf<Schema>
> = Simplify<Record<string, RowOf<Schema, TableId>>>;

type TablesOf<Schema extends StoreSchema> = Simplify<{
  [TableId in TableIdOf<Schema>]: TableOf<Schema, TableId>;
}>;

type CellUnionInTable<
  Schema extends StoreSchema,
  TableId extends TableIdOf<Schema>
> = RowOf<Schema, TableId>[CellIdOf<Schema, TableId>];

type AnyCellInSchema<Schema extends StoreSchema> = {
  [TableId in TableIdOf<Schema>]: CellUnionInTable<Schema, TableId>;
}[TableIdOf<Schema>];

type CellForCellIdAcrossTables<
  Schema extends StoreSchema,
  CellId extends string
> = {
  [TableId in TableIdOf<Schema>]: CellId extends CellIdOf<Schema, TableId>
    ? RowOf<Schema, TableId>[CellId]
    : never;
}[TableIdOf<Schema>];

type CellOrUnionOf<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>,
  CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
> = TableIdOrNull extends TableIdOf<Schema>
  ? CellIdOrNull extends CellIdOf<Schema, TableIdOrNull>
    ? CellOf<Schema, TableIdOrNull, CellIdOrNull>
    : CellIdOrNull extends null
    ? CellUnionInTable<Schema, TableIdOrNull>
    : never
  : TableIdOrNull extends null
  ? CellIdOrNull extends null
    ? AnyCellInSchema<Schema>
    : CellIdOrNull extends string
    ? CellForCellIdAcrossTables<Schema, CellIdOrNull>
    : never
  : never;

type CellListener<
  Schema extends StoreSchema,
  TableIdOrNull extends TableIdOfOrNull<Schema>,
  CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
> = (
  store: TypedStore<Schema>,
  tableId: ResolveTableId<Schema, TableIdOrNull>,
  rowId: Id,
  cellId: ResolveCellId<Schema, TableIdOrNull, CellIdOrNull>,
  newCell: CellOrUnionOf<Schema, TableIdOrNull, CellIdOrNull> | undefined,
  oldCell: CellOrUnionOf<Schema, TableIdOrNull, CellIdOrNull> | undefined,
  getCellChange:
    | ((
        tableId: ResolveTableId<Schema, TableIdOrNull>,
        rowId: Id,
        cellId: ResolveCellId<Schema, TableIdOrNull, CellIdOrNull>
      ) => [
        changed: boolean,
        oldCell: CellOrUnionOf<Schema, TableIdOrNull, CellIdOrNull> | undefined,
        newCell: CellOrUnionOf<Schema, TableIdOrNull, CellIdOrNull> | undefined
      ])
    | undefined
) => void;

export type ValueIdOf<Schema extends StoreSchema> =
  Schema["values"] extends StoreValuesSchema
    ? Extract<keyof z.infer<Schema["values"]>, string>
    : string;

type ValueIdOfOrNull<Schema extends StoreSchema> = ValueIdOf<Schema> | null;

type ValuesOf<Schema extends StoreSchema> =
  Schema["values"] extends StoreValuesSchema
    ? z.infer<Schema["values"]>
    : Record<string, unknown>;

type ValueOf<
  Schema extends StoreSchema,
  ValueId extends string
> = Schema["values"] extends StoreValuesSchema
  ? ValueId extends ValueIdOf<Schema>
    ? z.infer<Schema["values"]>[ValueId]
    : unknown
  : unknown;

type AnyValueInSchema<Schema extends StoreSchema> =
  Schema["values"] extends StoreValuesSchema
    ? ValuesOf<Schema>[ValueIdOf<Schema>]
    : unknown;

type ResolveValueId<
  Schema extends StoreSchema,
  ValueIdOrNull extends ValueIdOfOrNull<Schema>
> = ValueIdOrNull extends ValueIdOf<Schema> ? ValueIdOrNull : ValueIdOf<Schema>;

type ValueOrUnionOf<
  Schema extends StoreSchema,
  ValueIdOrNull extends ValueIdOfOrNull<Schema>
> = ValueIdOrNull extends ValueIdOf<Schema>
  ? ValueOf<Schema, ValueIdOrNull>
  : AnyValueInSchema<Schema>;

export interface TypedStore<Schema extends StoreSchema> {
  getTables(): Partial<TablesOf<Schema>>;
  setTables(tables: Partial<TablesOf<Schema>>): TypedStore<Schema>;
  delTables(): TypedStore<Schema>;

  getTable<TableId extends TableIdOf<Schema>>(
    tableId: TableId
  ): TableOf<Schema, TableId>;
  setTable<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    table: TableOf<Schema, TableId>
  ): TypedStore<Schema>;
  delTable<TableId extends TableIdOf<Schema>>(
    tableId: TableId
  ): TypedStore<Schema>;
  getRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): RowOf<Schema, TableId> | undefined;
  getRowOrThrow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): RowOf<Schema, TableId>;
  setRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id,
    row: RowOf<Schema, TableId>
  ): TypedStore<Schema>;
  setPartialRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id,
    row: Partial<RowOf<Schema, TableId>>
  ): TypedStore<Schema>;
  delRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): TypedStore<Schema>;
  getCell<
    TableId extends TableIdOf<Schema>,
    CellId extends CellIdOf<Schema, TableId>
  >(
    tableId: TableId,
    rowId: Id,
    cellId: CellId
  ): CellOf<Schema, TableId, CellId> | undefined;
  setCell<
    TableId extends TableIdOf<Schema>,
    CellId extends CellIdOf<Schema, TableId>,
    Cell extends CellOf<Schema, TableId, CellId>,
    MapCell extends (cell: Cell | undefined) => Cell
  >(
    tableId: TableId,
    rowId: Id,
    cellId: CellId,
    cell: Cell | MapCell
  ): TypedStore<Schema>;
  delCell<
    TableId extends TableIdOf<Schema>,
    CellId extends CellIdOf<Schema, TableId>
  >(
    tableId: TableId,
    rowId: Id,
    cellId: CellId
  ): TypedStore<Schema>;
  addCellListener<
    TableIdOrNull extends TableIdOfOrNull<Schema>,
    CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>,
    Listener extends CellListener<Schema, TableIdOrNull, CellIdOrNull>
  >(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    cellId: CellIdOrNull,
    listener: Listener,
    mutator?: boolean
  ): Id;
  hasTables(): boolean;
  hasTable<TableId extends TableIdOf<Schema>>(tableId: TableId): boolean;
  hasTableCell<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    cellId: CellIdOf<Schema, TableId>
  ): boolean;
  hasRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): boolean;
  hasCell<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id,
    cellId: CellIdOf<Schema, TableId>
  ): boolean;

  getTableIds(): TableIdOf<Schema>[];
  getRowIds<TableId extends TableIdOf<Schema>>(tableId: TableId): Id[];
  getCellIds<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): CellIdOf<Schema, TableId>[];
  getTableCellIds<TableId extends TableIdOf<Schema>>(
    tableId: TableId
  ): CellIdOf<Schema, TableId>[];
  getSortedRowIds<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    cellId?: CellIdOf<Schema, TableId>,
    descending?: boolean,
    offset?: number,
    limit?: number
  ): Id[];
  getSortedRowIds(args: SortedRowIdsArgs): Id[];

  transaction<Return>(actions: () => Return, doRollback?: DoRollback): Return;
  startTransaction(): TypedStore<Schema>;
  finishTransaction(doRollback?: DoRollback): TypedStore<Schema>;

  callListener(listenerId: Id): TypedStore<Schema>;
  delListener(listenerId: Id): TypedStore<Schema>;

  getJson(): Json;
  setJson(tablesAndValuesJson: Json): TypedStore<Schema>;

  getValues(): Partial<ValuesOf<Schema>>;
  setValues(values: Partial<ValuesOf<Schema>>): TypedStore<Schema>;
  delValues(): TypedStore<Schema>;

  getValue<ValueId extends ValueIdOf<Schema>>(
    valueId: ValueId
  ): ValueOf<Schema, ValueId> | undefined;
  setValue<
    ValueId extends ValueIdOf<Schema>,
    Value extends ValueOf<Schema, ValueId>,
    MapValue extends (value: Value | undefined) => Value
  >(
    valueId: ValueId,
    value: Value | MapValue
  ): TypedStore<Schema>;
  delValue<ValueId extends ValueIdOf<Schema>>(
    valueId: ValueId
  ): TypedStore<Schema>;

  hasValues(): boolean;
  hasValue<ValueId extends ValueIdOf<Schema>>(valueId: ValueId): boolean;
  getValueIds(): ValueIdOf<Schema>[];

  addValuesListener(
    listener: (store: TypedStore<Schema>) => void,
    mutator?: boolean
  ): Id;

  addValueListener<ValueIdOrNull extends ValueIdOfOrNull<Schema>>(
    valueId: ValueIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      valueId: ResolveValueId<Schema, ValueIdOrNull>,
      newValue: ValueOrUnionOf<Schema, ValueIdOrNull>,
      oldValue: ValueOrUnionOf<Schema, ValueIdOrNull>,
      getValueChange: unknown
    ) => void,
    mutator?: boolean
  ): Id;

  addValueIdsListener(
    listener: (
      store: TypedStore<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id;

  addHasValuesListener(
    listener: (store: TypedStore<Schema>, hasValues: boolean) => void,
    mutator?: boolean
  ): Id;

  addHasValueListener<ValueIdOrNull extends ValueIdOfOrNull<Schema>>(
    valueId: ValueIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      valueId: ResolveValueId<Schema, ValueIdOrNull>,
      hasValue: boolean
    ) => void,
    mutator?: boolean
  ): Id;

  addTableIdsListener(
    listener: (
      store: TypedStore<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id;

  addTableCellIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: TableIdOf<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id;

  addRowIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id;

  addCellIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: TableIdOf<Schema>,
      rowId: Id,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: boolean
  ): Id;

  addSortedRowIdsListener<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    cellId: CellIdOf<Schema, TableId> | undefined,
    descending: boolean,
    offset: number,
    limit: number | undefined,
    listener: (
      store: TypedStore<Schema>,
      tableId: TableId,
      cellId: CellIdOf<Schema, TableId> | undefined,
      descending: boolean,
      offset: number,
      limit: number | undefined,
      sortedRowIds: Id[]
    ) => void,
    mutator?: boolean
  ): Id;
  addSortedRowIdsListener<TableId extends TableIdOf<Schema>>(
    args: SortedRowIdsArgs,
    listener: (
      store: TypedStore<Schema>,
      tableId: TableId,
      cellId: CellIdOf<Schema, TableId> | undefined,
      descending: boolean,
      offset: number,
      limit: number | undefined,
      sortedRowIds: Id[]
    ) => void,
    mutator?: boolean
  ): Id;

  addHasTablesListener(
    listener: (store: TypedStore<Schema>, hasTables: boolean) => void,
    mutator?: boolean
  ): Id;

  addHasTableListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      hasTable: boolean
    ) => void,
    mutator?: boolean
  ): Id;

  addHasRowListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id,
      hasRow: boolean
    ) => void,
    mutator?: boolean
  ): Id;

  addHasCellListener<
    TableIdOrNull extends TableIdOfOrNull<Schema>,
    CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
  >(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    cellId: CellIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id,
      cellId: ResolveCellId<Schema, TableIdOrNull, CellIdOrNull>,
      hasCell: boolean
    ) => void,
    mutator?: boolean
  ): Id;

  addTablesListener(
    listener: (store: TypedStore<Schema>) => void,
    mutator?: boolean
  ): Id;

  addTableListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>
    ) => void,
    mutator?: boolean
  ): Id;

  addRowListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: TypedStore<Schema>,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id
    ) => void,
    mutator?: boolean
  ): Id;
}
