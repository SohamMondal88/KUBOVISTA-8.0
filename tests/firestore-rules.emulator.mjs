import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
let env;
before(async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "Run via npm run test:firestore.",
  );
  env = await initializeTestEnvironment({
    projectId: "demo-kubovistas",
    firestore: {
      rules: await readFile(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
test("Firestore denies all browser data access because PostgreSQL is authoritative", async () => {
  const anonymous = env.unauthenticatedContext().firestore();
  const signedIn = env.authenticatedContext("alice").firestore();
  for (const path of [
    "users/alice",
    "users/alice/tripDrafts/one",
    "stories/public",
    "bookings/one",
    "payments/one",
    "notifications/one",
  ]) {
    await assertFails(getDoc(doc(anonymous, path)));
    await assertFails(getDoc(doc(signedIn, path)));
    await assertFails(setDoc(doc(signedIn, path), { test: true }));
  }
});
