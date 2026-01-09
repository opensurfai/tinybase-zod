import { expectTypeOf, test } from "bun:test";
import { createStore, type MergeableStore, type Store } from "tinybase";
import z from "zod";
import { createReadonlyTypedStore, createTypedStore } from "./store";
import type { ContentOf, MergeableTypedStore } from "./type";

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

test("ReadonlyTypedStore type surface", () => {
  const store = createStore();
  const typed = createTypedStore(store, schema);
  const ro = createReadonlyTypedStore(store, schema);

  // asReadonly() narrows to the readonly surface
  expectTypeOf(typed.asReadonly()).toEqualTypeOf<typeof ro>();

  // untyped exposes the underlying TinyBase store
  expectTypeOf(typed.untyped).toEqualTypeOf<Store>();
  expectTypeOf(ro.untyped).toEqualTypeOf<Store>();

  // untyped preserves the exact underlying store subtype (e.g. MergeableStore)
  if (false) {
    const mergeable = null as any as MergeableStore;
    const typedMergeable = createTypedStore(mergeable, schema);
    const roMergeable = createReadonlyTypedStore(mergeable, schema);
    expectTypeOf(typedMergeable.untyped).toEqualTypeOf<MergeableStore>();
    expectTypeOf(roMergeable.untyped).toEqualTypeOf<MergeableStore>();

    // setDefaultContent is only available when the underlying store is mergeable.
    expectTypeOf(typedMergeable).toEqualTypeOf<
      MergeableTypedStore<typeof schema, MergeableStore>
    >();
    expectTypeOf(typedMergeable.setDefaultContent).toEqualTypeOf<
      (
        content: ContentOf<typeof schema> | (() => ContentOf<typeof schema>)
      ) => MergeableTypedStore<typeof schema, MergeableStore>
    >();
  }

  // listener callbacks receive the readonly store
  ro.addTablesListener((store) => {
    expectTypeOf(store).toEqualTypeOf<typeof ro>();
  });

  // setContent is available on writable typed stores
  expectTypeOf(typed.setContent).toEqualTypeOf<
    (content: ContentOf<typeof schema> | (() => ContentOf<typeof schema>)) => any
  >();

  if (false) {
    // writes are not part of the readonly surface
    // @ts-expect-error readonly store has no setRow
    ro.setRow("users", "u1", { name: "Ava", age: 34 });
    // @ts-expect-error readonly store has no setValue
    ro.setValue("selectedUserId", "u1");
    // @ts-expect-error readonly store has no setContent
    ro.setContent([{ users: {} }, { selectedUserId: null }]);

    // mutator listeners are disallowed at the type level
    // @ts-expect-error mutator must be false/undefined on readonly stores
    ro.addTablesListener(() => {}, true);

    // listener callback store param is readonly
    ro.addTablesListener((store) => {
      // @ts-expect-error readonly store in callbacks has no setRow
      store.setRow("users", "u1", { name: "Ava", age: 34 });
    });
  }
});


