import { createStore } from "tinybase";
import z from "zod";
import { createTypedStore } from "./store";

const exampleSchema = z.object({
  string: z.string(),
  nullableString: z.string().nullable(),
  number: z.number(),
  enum: z.enum(["a", "b"]),
  object: z.object({
    a: z.string(),
  }),
  array: z.array(z.string()),
});

const secondSchema = z.object({
  seconds: z.number(),
});

const schema = {
  tables: {
    examples: exampleSchema,
    seconds: secondSchema,
  },
  values: z.object({}),
} as const;

const store = createStore();
const typedStore = createTypedStore(store, schema);

typedStore.setRow("examples", "1", {
  string: "s",
  nullableString: "s",
  number: 1,
  enum: "a",
  object: { a: "s" },
  array: ["a"],
});

const table = typedStore.getTable("examples");
console.log(table);

typedStore.addCellListener(
  "examples",
  "2",
  "array",
  (store, tableId, rowId, cellId, newCell, oldCell) => {}
);
typedStore.addCellListener(null, "2", "array", (store) => {});
// const encodedRow = store.getRow("examples", "1");
// /* complex cells are json encoded
// {
//   string: "s",
//   nullableString: "s",
//   number: 1,
//   enum: "a",
//   object: "{\"a\":\"s\"}",
//   array: "[\"a\"]",
// }
// */

// const decodedRow = typedStore.getRow("examples", "1");
// /* decoded to complex types
// {
//   string: "s",
//   nullableString: "s",
//   number: 1,
//   enum: "a",
//   object: {
//     a: "s",
//   },
//   array: [ "a" ],
// }
// */

// // works for cells too
// typedStore.setCell("examples", "1", "object", { a: "b" });
// const cell = typedStore.getCell("examples", "1", "object");
// // { a: "b" }
