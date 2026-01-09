import type {
  DoRollback,
  GetIdChanges,
  Id,
  IdOrNull,
  Json,
  MergeableStore,
  Store,
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
  Self,
  TableIdOrNull extends TableIdOfOrNull<Schema>,
  CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
> = (
  store: Self,
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

export type ContentOf<Schema extends StoreSchema> = [
  tables: Partial<TablesOf<Schema>>,
  values: Partial<ValuesOf<Schema>>
];

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

interface StoreReadApi<
  Schema extends StoreSchema,
  Self,
  MutatorFlag extends boolean | undefined
> {
  getTables(): Partial<TablesOf<Schema>>;

  getTable<TableId extends TableIdOf<Schema>>(
    tableId: TableId
  ): TableOf<Schema, TableId>;
  getRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): RowOf<Schema, TableId> | undefined;
  getRowOrThrow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id
  ): RowOf<Schema, TableId>;
  getCell<
    TableId extends TableIdOf<Schema>,
    CellId extends CellIdOf<Schema, TableId>
  >(
    tableId: TableId,
    rowId: Id,
    cellId: CellId
  ): CellOf<Schema, TableId, CellId> | undefined;
  addCellListener<
    TableIdOrNull extends TableIdOfOrNull<Schema>,
    CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>,
    Listener extends CellListener<Schema, Self, TableIdOrNull, CellIdOrNull>
  >(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    cellId: CellIdOrNull,
    listener: Listener,
    mutator?: MutatorFlag
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

  callListener(listenerId: Id): Self;
  delListener(listenerId: Id): Self;

  getJson(): Json;

  getValues(): Partial<ValuesOf<Schema>>;

  getValue<ValueId extends ValueIdOf<Schema>>(
    valueId: ValueId
  ): ValueOf<Schema, ValueId>;

  hasValues(): boolean;
  hasValue<ValueId extends ValueIdOf<Schema>>(valueId: ValueId): boolean;
  getValueIds(): ValueIdOf<Schema>[];

  addValuesListener(
    listener: (store: Self) => void,
    mutator?: MutatorFlag
  ): Id;

  addValueListener<ValueIdOrNull extends ValueIdOfOrNull<Schema>>(
    valueId: ValueIdOrNull,
    listener: (
      store: Self,
      valueId: ResolveValueId<Schema, ValueIdOrNull>,
      newValue: ValueOrUnionOf<Schema, ValueIdOrNull> | undefined,
      oldValue: ValueOrUnionOf<Schema, ValueIdOrNull> | undefined,
      getValueChange:
        | ((
            valueId: ResolveValueId<Schema, ValueIdOrNull>
          ) => [
            changed: boolean,
            oldValue: ValueOrUnionOf<Schema, ValueIdOrNull> | undefined,
            newValue: ValueOrUnionOf<Schema, ValueIdOrNull> | undefined
          ])
        | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addValueIdsListener(
    listener: (
      store: Self,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasValuesListener(
    listener: (store: Self, hasValues: boolean) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasValueListener<ValueIdOrNull extends ValueIdOfOrNull<Schema>>(
    valueId: ValueIdOrNull,
    listener: (
      store: Self,
      valueId: ResolveValueId<Schema, ValueIdOrNull>,
      hasValue: boolean
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addTableIdsListener(
    listener: (
      store: Self,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addTableCellIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: Self,
      tableId: TableIdOf<Schema>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addRowIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addCellIdsListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: Self,
      tableId: TableIdOf<Schema>,
      rowId: Id,
      getIdChanges: GetIdChanges | undefined
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addSortedRowIdsListener<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    cellId: CellIdOf<Schema, TableId> | undefined,
    descending: boolean,
    offset: number,
    limit: number | undefined,
    listener: (
      store: Self,
      tableId: TableId,
      cellId: CellIdOf<Schema, TableId> | undefined,
      descending: boolean,
      offset: number,
      limit: number | undefined,
      sortedRowIds: Id[]
    ) => void,
    mutator?: MutatorFlag
  ): Id;
  addSortedRowIdsListener<TableId extends TableIdOf<Schema>>(
    args: SortedRowIdsArgs,
    listener: (
      store: Self,
      tableId: TableId,
      cellId: CellIdOf<Schema, TableId> | undefined,
      descending: boolean,
      offset: number,
      limit: number | undefined,
      sortedRowIds: Id[]
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasTablesListener(
    listener: (store: Self, hasTables: boolean) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasTableListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      hasTable: boolean
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasRowListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id,
      hasRow: boolean
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addHasCellListener<
    TableIdOrNull extends TableIdOfOrNull<Schema>,
    CellIdOrNull extends CellIdOrUnionOfOrNull<Schema, TableIdOrNull>
  >(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    cellId: CellIdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id,
      cellId: ResolveCellId<Schema, TableIdOrNull, CellIdOrNull>,
      hasCell: boolean
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addTablesListener(
    listener: (store: Self) => void,
    mutator?: MutatorFlag
  ): Id;

  addTableListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>
    ) => void,
    mutator?: MutatorFlag
  ): Id;

  addRowListener<TableIdOrNull extends TableIdOfOrNull<Schema>>(
    tableId: TableIdOrNull,
    rowId: IdOrNull,
    listener: (
      store: Self,
      tableId: ResolveTableId<Schema, TableIdOrNull>,
      rowId: Id
    ) => void,
    mutator?: MutatorFlag
  ): Id;
}

interface StoreWriteApi<Schema extends StoreSchema, Self> {
  setContent(content: ContentOf<Schema> | (() => ContentOf<Schema>)): Self;
  setTables(tables: Partial<TablesOf<Schema>>): Self;
  delTables(): Self;
  setTable<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    table: TableOf<Schema, TableId>
  ): Self;
  delTable<TableId extends TableIdOf<Schema>>(tableId: TableId): Self;
  setRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id,
    row: RowOf<Schema, TableId>
  ): Self;
  setPartialRow<TableId extends TableIdOf<Schema>>(
    tableId: TableId,
    rowId: Id,
    row: Partial<RowOf<Schema, TableId>>
  ): Self;
  delRow<TableId extends TableIdOf<Schema>>(tableId: TableId, rowId: Id): Self;
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
  ): Self;
  delCell<TableId extends TableIdOf<Schema>, CellId extends CellIdOf<Schema, TableId>>(
    tableId: TableId,
    rowId: Id,
    cellId: CellId
  ): Self;

  transaction<Return>(actions: () => Return, doRollback?: DoRollback): Return;
  startTransaction(): Self;
  finishTransaction(doRollback?: DoRollback): Self;

  setJson(tablesAndValuesJson: Json): Self;

  setValues(values: Partial<ValuesOf<Schema>>): Self;
  delValues(): Self;
  setValue<
    ValueId extends ValueIdOf<Schema>,
    Value extends ValueOf<Schema, ValueId>,
    MapValue extends (value: Value | undefined) => Value
  >(
    valueId: ValueId,
    value: Value | MapValue
  ): Self;
  delValue<ValueId extends ValueIdOf<Schema>>(valueId: ValueId): Self;
}

export interface TypedStore<
  Schema extends StoreSchema,
  UntypedStore extends Store = Store
> extends StoreReadApi<
    Schema,
    TypedStore<Schema, UntypedStore>,
    boolean | undefined
  >,
    StoreWriteApi<Schema, TypedStore<Schema, UntypedStore>> {
  untyped: UntypedStore;
  asReadonly(): ReadonlyTypedStore<Schema, UntypedStore>;
}

export interface MergeableTypedStore<
  Schema extends StoreSchema,
  UntypedStore extends MergeableStore = MergeableStore
> extends TypedStore<Schema, UntypedStore> {
  setDefaultContent(
    content: ContentOf<Schema> | (() => ContentOf<Schema>)
  ): MergeableTypedStore<Schema, UntypedStore>;
}

export interface ReadonlyTypedStore<
  Schema extends StoreSchema,
  UntypedStore extends Store = Store
> extends StoreReadApi<
    Schema,
    ReadonlyTypedStore<Schema, UntypedStore>,
    false | undefined
  > {
  untyped: UntypedStore;
  asReadonly(): ReadonlyTypedStore<Schema, UntypedStore>;
}
