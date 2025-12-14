import { createStore } from "tinybase";
import { createTypedStore, dateAsIso, json } from "tinybase-zod";
import z from "zod";

const userSchema = z.object({
  name: z.string(),
  email: z.email(),
  createdAt: dateAsIso,
  preferences: json(
    z.object({
      theme: z.enum(["light", "dark"]),
    })
  ),
});

const schema = {
  tables: {
    users: userSchema,
  },
  values: z.object({}),
} as const;

const store = createStore();
const typedStore = createTypedStore(store, schema);

typedStore.setRow("users", "1", {
  name: "David",
  email: "team@opensurf.ai",
  createdAt: new Date(),
  preferences: { theme: "dark" },
});

// complex cells are encoded on set
const encodedRow = store.getRow("users", "1");
console.log(encodedRow);
/* 
{
  name: "David",
  email: "team@opensurf.ai",
  createdAt: "2025-12-14T23:01:09.242Z",
  preferences: "{\"theme\":\"dark\"}",
}
*/

// and decoded on get
const decodedRow = typedStore.getRow("users", "1");
console.log(decodedRow);
/*
{
  name: "David",
  email: "team@opensurf.ai",
  createdAt: 2025-12-14T23:01:09.242Z,
  preferences: {
    theme: "dark",
  },
}
*/

// and for cell / table / listner apis too
typedStore.setCell("users", "1", "preferences", { theme: "light" });
const cell = typedStore.getCell("users", "1", "preferences");
console.log(cell);
/*
{
  theme: "light",
}
*/
