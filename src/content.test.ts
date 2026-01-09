import { expect, test } from "bun:test";
import { createStore } from "tinybase";
import z from "zod";
import { json } from "./codec";
import { createTypedStore } from "./store";

const schema = {
  tables: {
    users: z.object({
      name: z.string(),
      prefs: json(z.object({ theme: z.enum(["light", "dark"]) })),
    }),
  },
  values: z.object({
    selectedUserId: z.string().nullable(),
  }),
} as const;

test("typed.setContent encodes typed content and overwrites tables+values together", () => {
  const store = createStore();
  const typed = createTypedStore(store, schema);

  typed.setContent([
    { users: { u1: { name: "Ava", prefs: { theme: "dark" } } } },
    { selectedUserId: "u1" },
  ]);

  // Reads are decoded
  expect(typed.getRow("users", "u1")).toEqual({
    name: "Ava",
    prefs: { theme: "dark" },
  });
  expect(typed.getValue("selectedUserId")).toBe("u1");

  // Underlying store is encoded
  expect(store.getCell("users", "u1", "prefs")).toBe('{"theme":"dark"}');

  // Overwrite both parts again
  typed.setContent([
    { users: { u2: { name: "Bea", prefs: { theme: "light" } } } },
    { selectedUserId: "u2" },
  ]);

  expect(typed.getRow("users", "u1")).toBeUndefined();
  expect(typed.getRow("users", "u2")).toEqual({
    name: "Bea",
    prefs: { theme: "light" },
  });
  expect(typed.getValue("selectedUserId")).toBe("u2");
});

