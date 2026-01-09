import { expect, test } from "bun:test";
import { createMergeableStore } from "tinybase";
import z from "zod";
import { createTypedStore } from "./store";

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

test("MergeableStore: typed.setDefaultContent encodes typed content and initializes data", () => {
  const store = createMergeableStore("s1");
  const typed = createTypedStore(store, schema);

  typed.setDefaultContent([
    {
      users: {
        u1: { name: "Ava", age: 34 },
      },
    },
    {
      selectedUserId: "u1",
    },
  ]);

  expect(typed.getRow("users", "u1")).toEqual({ name: "Ava", age: 34 });
  expect(typed.getValue("selectedUserId")).toBe("u1");
});

