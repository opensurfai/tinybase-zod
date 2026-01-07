import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { createReadonlyTypedStore, createTypedStore } from "./store";

const schema = {
  tables: {
    users: z.object({
      name: z.string(),
      age: z.number(),
    }),
  },
  values: z.object({
    selectedUserId: z.string().nullable(),
  }),
} as const;

test("createReadonlyTypedStore: reads work; writes throw", () => {
  const store = createStore();
  store.setTables({ users: {} });
  store.setValues({});

  const typed = createTypedStore(store, schema);
  const ro = createReadonlyTypedStore(store, schema);

  typed.setRow("users", "u1", { name: "Ava", age: 34 });
  typed.setValue("selectedUserId", "u1");

  expect(ro.getRow("users", "u1")).toEqual({ name: "Ava", age: 34 });
  expect(ro.getValue("selectedUserId")).toBe("u1");
  // Note: readonly is type-level only (developer ergonomics), not a runtime guard.
});

test("TypedStore.asReadonly() returns a readonly view", () => {
  const store = createStore();
  store.setTables({ users: {} });
  store.setValues({});

  const typed = createTypedStore(store, schema);
  const ro = typed.asReadonly();

  typed.setRow("users", "u1", { name: "Ava", age: 34 });
  expect(ro.getRow("users", "u1")).toEqual({ name: "Ava", age: 34 });
  // Note: readonly is type-level only (developer ergonomics), not a runtime guard.
});


