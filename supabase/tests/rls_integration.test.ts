/**
 * Integration suite: applies migrations 0001-0004 + seed to a real Postgres
 * engine (PGlite) and proves auth primitives, RLS household isolation,
 * integrity triggers, CHECK constraints and the search vectors end-to-end.
 * The token/header mechanism mirrors PostgREST (request.headers GUC).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { tokenHash, verifyPassword } from "../functions/_shared/auth.ts";

const root = new URL("../../", import.meta.url); // supabase/tests/ → repo root
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";

let db: PGlite;

const rows = async (sql: string) => (await db.query(sql)).rows;
const count = async (sql: string) => String((await rows(sql))[0].count);

async function asAnon(token: string, fn: () => Promise<void>): Promise<void> {
  await db.exec(`SET "request.headers" = '{"x-household-token":"${token}"}'`);
  await db.exec("SET ROLE anon");
  try {
    await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

async function expectError(sql: string, pattern?: RegExp): Promise<void> {
  try {
    await db.exec(sql);
    assert.fail("expected an error, none was thrown");
  } catch (e) {
    if (pattern) assert.match(String(e.message), pattern);
  }
}

before(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon NOLOGIN;");
  await db.exec("CREATE ROLE authenticated NOLOGIN;");
  await db.exec("CREATE ROLE service_role NOLOGIN;");
  for (const m of [
    "0001_bootstrap.sql",
    "0002_core_schema.sql",
    "0003_service_role_grants.sql",
    "0004_search_vectors.sql",
  ]) {
    await db.exec(read(`supabase/migrations/${m}`));
  }
  await db.exec(read("supabase/seed.sql"));
});

after(async () => {
  await db.close();
});

test("RLS is enabled on all 6 tables", async () => {
  const names = (await rows(
    "SELECT tablename FROM pg_tables WHERE schemaname='hearth' AND rowsecurity ORDER BY tablename",
  )).map((r) => r.tablename).join(",");
  assert.equal(
    names,
    "device_subscriptions,freezer_items,household_tokens,households,profiles,todos",
  );
});

test("seed password hashes are real PBKDF2 and verify with the service hasher", async () => {
  const hash = (await rows(`SELECT password_hash FROM hearth.households WHERE display_code='HEARTH'`))[0].password_hash as string;
  assert.ok(hash.startsWith("pbkdf2$sha256$600000$"));
  assert.equal(await verifyPassword("dev-password-alpha", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("seed token hashes match the service tokenHash (same sha256 hex as RLS helper)", async () => {
  const stored = (await rows(
    `SELECT token_hash FROM hearth.household_tokens WHERE household_id='${A}'`,
  ))[0].token_hash as string;
  assert.equal(stored, await tokenHash("dev-token-alpha"));
});

test("household isolation: alpha sees 5 profiles/4 todos, beta sees 2/1", async () => {
  await asAnon("dev-token-alpha", async () => {
    assert.equal(await count("SELECT count(*) FROM hearth.profiles"), "5");
    assert.equal(await count("SELECT count(*) FROM hearth.todos"), "4");
  });
  await asAnon("dev-token-beta", async () => {
    assert.equal(await count("SELECT count(*) FROM hearth.profiles"), "2");
    assert.equal(await count("SELECT count(*) FROM hearth.todos"), "1");
  });
});

test("cross-household INSERT is blocked by RLS", async () => {
  await asAnon("dev-token-alpha", () =>
    expectError(
      `INSERT INTO hearth.todos (household_id, profile_id, title)
       VALUES ('${B}','00000000-0000-0000-0000-000000000111','sneaky')`,
      /row-level security policy/i,
    ));
});

test("cross-household UPDATE and DELETE affect 0 rows, data intact", async () => {
  await asAnon("dev-token-alpha", async () => {
    await db.exec(`UPDATE hearth.todos SET title='hacked' WHERE household_id='${B}'`);
    await db.exec(`DELETE FROM hearth.todos WHERE household_id='${B}'`);
    assert.equal(await count("SELECT count(*) FROM hearth.todos"), "4"); // alpha untouched
  });
  await asAnon("dev-token-beta", async () => {
    const title = (await rows(
      `SELECT title FROM hearth.todos WHERE id='00000000-0000-0000-0000-000000000211'`,
    ))[0].title as string;
    assert.equal(title, "Beta task");
  });
});

test("6th profile is rejected by the advisory-locked trigger", async () => {
  await asAnon("dev-token-alpha", () =>
    expectError(
      `INSERT INTO hearth.profiles (household_id, name) VALUES ('${A}','Sixth Person')`,
      /profile limit/i,
    ));
});

test("cross-household profile references are rejected by trigger", async () => {
  await asAnon("dev-token-alpha", () =>
    expectError(
      `INSERT INTO hearth.todos (household_id, profile_id, title)
       VALUES ('${A}','00000000-0000-0000-0000-000000000111','x')`,
      /does not belong/i,
    ));
});

test("CHECKs: malformed tags and ghost-completed todos rejected", async () => {
  await asAnon("dev-token-alpha", async () => {
    await expectError(
      `INSERT INTO hearth.todos (household_id, profile_id, title, tags)
       VALUES ('${A}','00000000-0000-0000-0000-000000000101','bad',array['has space','ok'])`,
      /check constraint/i,
    );
    await expectError(
      `INSERT INTO hearth.todos (household_id, profile_id, title, completed)
       VALUES ('${A}','00000000-0000-0000-0000-000000000101','ghost',true)`,
      /check constraint/i,
    );
  });
});

test("household_tokens is deny-all for anon", async () => {
  await asAnon("dev-token-alpha", () =>
    expectError("SELECT count(*) FROM hearth.household_tokens", /permission denied/i));
});

test("anon can insert, complete and delete own-household todos", async () => {
  await asAnon("dev-token-alpha", async () => {
    await db.exec(
      `INSERT INTO hearth.todos (household_id, profile_id, title, due_date, tags)
       VALUES ('${A}','00000000-0000-0000-0000-000000000102','RLS insert test',current_date + 2,array['test'])`,
    );
    assert.equal(
      await count(`SELECT count(*) FROM hearth.todos WHERE title='RLS insert test'`),
      "1",
    );
  });
});

test("search: tsvector full-text + #tag containment + GIN index", async () => {
  const hits = (await rows(
    `SELECT title FROM hearth.todos
     WHERE search_vector @@ websearch_to_tsquery('simple','bins')`,
  )).map((r) => r.title);
  assert.deepEqual(hits, ["Take out the bins"]);

  await asAnon("dev-token-alpha", async () => {
    const chores = await count("SELECT count(*) FROM hearth.todos WHERE tags @> array['chore']");
    assert.equal(chores, "2");
  });

  const gin = await count(
    `SELECT count(*) FROM pg_indexes WHERE schemaname='hearth' AND indexname IN
     ('todos_search_gin','freezer_items_search_gin')`,
  );
  assert.equal(gin, "2");
});

test("all required indexes exist", async () => {
  const required = [
    "todos_active_deadline_idx",
    "freezer_items_added_date_idx",
    "device_subscriptions_profile_idx",
    "todos_tags_gin",
    "freezer_items_tags_gin",
    "profiles_household_idx",
    "household_tokens_household_idx",
    "todos_household_idx",
    "freezer_items_household_idx",
  ];
  const found = new Set(
    (await rows(
      `SELECT indexname FROM pg_indexes WHERE schemaname='hearth' AND indexname IN
       ('todos_active_deadline_idx','freezer_items_added_date_idx',
        'device_subscriptions_profile_idx','todos_tags_gin','freezer_items_tags_gin',
        'profiles_household_idx','household_tokens_household_idx',
        'todos_household_idx','freezer_items_household_idx')`,
    )).map((r) => r.indexname),
  );
  for (const name of required) assert.ok(found.has(name), `missing index ${name}`);
});
