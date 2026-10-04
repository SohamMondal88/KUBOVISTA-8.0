import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalPath, routeParts } from "../routing.js";
import { publicSeoRoutes, privateSeoRoutes } from "../scripts/seo.mjs";

test("legacy and flat URLs resolve to one topical canonical URL", () => {
  assert.equal(canonicalPath("#/destinations"), "/destinations");
  assert.equal(
    canonicalPath("/destination/darjeeling"),
    "/destinations/darjeeling",
  );
  assert.equal(canonicalPath("/guide/slow-travel"), "/guides/slow-travel");
  assert.equal(canonicalPath("/about"), "/company/about");
  assert.equal(canonicalPath("/privacy"), "/legal/privacy");
  assert.equal(
    canonicalPath("/login?return=%2Fplanner"),
    "/account/login?return=%2Fplanner",
  );
  assert.deepEqual(routeParts("/destinations/darjeeling"), [
    "destination",
    "darjeeling",
  ]);
  assert.deepEqual(routeParts("/legal/privacy"), ["privacy"]);
});

test("SEO route metadata is unique and private pages are noindex", () => {
  assert.equal(
    new Set(publicSeoRoutes.map((page) => page.path)).size,
    publicSeoRoutes.length,
  );
  assert.equal(
    new Set(publicSeoRoutes.map((page) => page.title)).size,
    publicSeoRoutes.length,
  );
  assert.ok(
    publicSeoRoutes.every(
      (page) => page.index && page.description.length >= 50,
    ),
  );
  assert.ok(
    privateSeoRoutes.every(
      (page) =>
        !page.index &&
        (/^(\/account\/|\/journal\/|\/company\/enquiry-inbox$)/.test(
          page.path,
        ) ||
          ["/planner", "/search"].includes(page.path)),
    ),
  );
});

test("article routes expose publication metadata and substantial original copy", () => {
  const articles = publicSeoRoutes.filter((page) => page.type === "Article");
  assert.ok(articles.length >= 8);
  for (const page of articles) {
    assert.ok(page.article.wordCount >= 300, page.path);
    assert.equal(page.article.body.join(" "), page.copy);
    assert.equal(page.lastmod, "2026-09-27");
  }
});

test("templates contain clean internal links and absolute assets", async () => {
  const files = [
    "index.html",
    "app.js",
    "company.js",
    "journal.js",
    "membership.js",
    "travel-date.js",
    "booking-ui.js",
    "kubo.js",
  ];
  for (const file of files) {
    const source = await readFile(
      new URL("../" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /href=["'`]#\//,
      `${file} still contains a hash route`,
    );
  }
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/app\.js"/);
  assert.equal((html.match(/rel="stylesheet"/g) || []).length, 4);
});
