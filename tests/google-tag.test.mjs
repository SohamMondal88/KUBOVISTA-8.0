import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = await readFile(
  new URL("../client/consent.js", import.meta.url),
  "utf8",
);

function context() {
  const stored = new Map(),
    scripts = [];
  const document = {
    title: "KuboVistas destinations",
    getElementById: () => null,
    createElement: () => {
      const listeners = {};
      return {
        dataset: {},
        addEventListener: (name, fn) => (listeners[name] = fn),
        listeners,
      };
    },
    head: {
      append: (element) => {
        scripts.push(element);
        element.listeners.load?.();
      },
    },
  };
  const ctx = {
    location: {
      origin: "https://kubo.example",
      pathname: "/destinations",
      search: "?email=private@example.com",
    },
    localStorage: {
      getItem: (k) => stored.get(k),
      setItem: (k, v) => stored.set(k, v),
    },
    document,
    addEventListener() {},
    Event,
    console,
  };
  ctx.window = ctx;
  ctx.scripts = scripts;
  vm.createContext(ctx);
  vm.runInContext(source.replace(/^export /gm, ""), ctx);
  return ctx;
}

test("analytics and Google Identity are absent from the initial document", () => {
  assert.equal(html.includes("googletagmanager.com/gtag/js"), false);
  assert.equal(html.includes("accounts.google.com/gsi/client"), false);
  assert.match(html, /src="\/consent-client\.js"/);
  assert.equal(html.includes("G-C0ZK56K9YQ"), false);
});

test("Google Identity remains configured and is loaded by the authentication module", async () => {
  const auth = await readFile(
    new URL("../client/firebase-auth.js", import.meta.url),
    "utf8",
  );
  assert.match(
    html,
    /330040271750-e4s9q3gb7b2bnl3crbf5dmmv25bu6456\.apps\.googleusercontent\.com/,
  );
  assert.match(auth, /accounts\.google\.com\/gsi\/client/);
  assert.match(auth, /kubovistasGoogleIdentity/);
});

test("Analytics loads only after opt-in and sends sanitized public events", async () => {
  const ctx = context();
  const events = () => (ctx.dataLayer || []).filter((v) => v[0] === "event");
  assert.equal(ctx.scripts.length, 0);
  assert.equal(ctx.gtag, undefined);
  assert.equal(events().length, 0);
  await ctx.setAnalyticsConsent(true);
  assert.equal(ctx.scripts.length, 1);
  assert.match(ctx.scripts[0].src, /googletagmanager\.com\/gtag\/js/);
  assert.equal(ctx["ga-disable-G-MMP3139QSB"], false);
  assert.equal(events().length, 1);
  assert.equal(
    events()[0][2].page_location,
    "https://kubo.example/destinations",
  );
  ctx.location.pathname = "/account/booking/private-booking-id";
  ctx.trackPublicPage();
  assert.equal(events().length, 1);
  await ctx.setAnalyticsConsent(false);
  ctx.location.pathname = "/company/about";
  ctx.trackPublicPage();
  assert.equal(events().length, 1);
  assert.equal(ctx["ga-disable-G-MMP3139QSB"], true);
});
