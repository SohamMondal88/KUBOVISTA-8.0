import "./patch-jwks-esm.mjs";
import { buildFirebase } from "./build-firebase.mjs";
import { validateAffiliateOffers } from "../affiliates.js";
import { affiliateOffers } from "../affiliate-data.js";
import { adsenseConfig } from "./adsense-config.mjs";
import { buildSeo } from "./seo.mjs";
import {
  mkdir,
  copyFile,
  cp,
  rm,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const offers = validateAffiliateOffers(
  process.env.AFFILIATE_OFFERS_JSON
    ? JSON.parse(process.env.AFFILIATE_OFFERS_JSON)
    : affiliateOffers,
);
const ads = adsenseConfig(process.env);
if (process.env.ADSENSE_ENABLED === "true" && !ads.enabled)
  console.warn(
    "AdSense disabled for this build: publisher, slot, consent, certified CMP and dashboard verification are required.",
  );
const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [
  "grounded-knowledge.js",
  "search-catalog.js",
  "growth-ui.js",
  "growth.css",
  "packages.js",
  "packages-ui.js",
  "packages.css",
  "operations.css",
  "affiliates.js",
  "affiliate-data.js",
  "affiliates.css",
  "membership.js",
  "membership.css",
  "travel-date.js",
  "travel-date.css",
  "adsense.js",
  "adsense.css",
  "index.html",
  "amp.html",
  "styles.css",
  "app.js",
  "hero-video.js",
  "routing.js",
  "account.js",
  "journal.js",
  "company.js",
  "explore.js",
  "destination-meta.js",
  "partner-data.js",
  "travel-links.js",
  "booking-ui.js",
  "kubo.js",
  "kubo-knowledge.js",
  "navigation.css",
  "kubo.css",
  "data.js",
  "legal.js",
  "vercel-analytics.js",
  "vercel-speed-insights.js",
])
  await copyFile(new URL(name, root), new URL(name, output));
await cp(new URL("assets/", root), new URL("assets/", output), {
  recursive: true,
});
const html = await readFile(new URL("index.html", output), "utf8");
const videoFiles = await readdir(new URL("assets/videos/", root));
const heroModule = new URL("hero-video.js", output);
await writeFile(
  heroModule,
  (await readFile(heroModule, "utf8")).replace(
    "__HERO_VIDEO_SOURCE__",
    videoFiles.includes("home-hero.mp4") ? "/assets/videos/home-hero.mp4" : "",
  ),
);
const appCheckKey = process.env.FIREBASE_APP_CHECK_SITE_KEY || "";
if (appCheckKey && !/^[A-Za-z0-9_-]{20,100}$/.test(appCheckKey))
  throw new Error("Invalid public App Check site key.");
const firebaseAi = process.env.FIREBASE_AI_ENABLED === "true";
if (
  firebaseAi &&
  (!appCheckKey ||
    process.env.FIREBASE_AI_APP_CHECK_VERIFIED !== "true" ||
    !/^[a-z0-9.-]{4,80}$/.test(process.env.FIREBASE_AI_MODEL || ""))
)
  throw Error(
    "Firebase AI Logic requires a verified App Check configuration and public model identifier.",
  );
const configuredHtml = html
  .replace("<!-- ADSENSE_CONFIG -->", ads.head)
  .replace(
    "<!-- APPCHECK_CONFIG -->",
    (appCheckKey
      ? `<meta name="kubovistas-app-check-key" content="${appCheckKey}">`
      : "") +
      (firebaseAi
        ? `<meta name="kubovistas-firebase-ai-model" content="${process.env.FIREBASE_AI_MODEL}">`
        : ""),
  );
await writeFile(new URL("index.html", output), configuredHtml);
const amp = await readFile(new URL("amp.html", output), "utf8");
const configuredAmp = amp
  .replace("<!-- ADSENSE_AMP_ACCOUNT -->", ads.ampAccount)
  .replace("<!-- ADSENSE_AMP_SCRIPTS -->", ads.ampScripts)
  .replace("<!-- ADSENSE_AMP_BODY -->", ads.ampBody);
await writeFile(new URL("amp.html", output), configuredAmp);
await writeFile(new URL("ads.txt", output), ads.adsTxt);
await writeFile(
  new URL("affiliate-data.js", output),
  "export const affiliateOffers = " + JSON.stringify(offers) + ";\n",
);
await buildFirebase(output);
await buildSeo(output, configuredHtml);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(new URL(entry.name + "/", directory))
          : [new URL(entry.name, directory)],
      ),
    )
  ).flat();
}
async function optimizeAndFingerprintImages() {
  const assets = new URL("assets/", output);
  for (const name of ["himalaya", "goa"]) {
    const source = new URL(name + ".jpg", assets);
    for (const width of [640, 1200, 2000]) {
      await sharp(fileURLToPath(source))
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(fileURLToPath(new URL(`${name}-${width}.webp`, assets)));
      await sharp(fileURLToPath(source))
        .resize({ width, withoutEnlargement: true })
        .avif({ quality: 60 })
        .toFile(fileURLToPath(new URL(`${name}-${width}.avif`, assets)));
    }
  }
  const imageFiles = (await walk(assets)).filter((file) =>
    /\.(?:jpg|webp|avif)$/i.test(file.pathname),
  );
  const replacements = new Map();
  for (const file of imageFiles) {
    const contents = await readFile(file);
    const extension = extname(file.pathname);
    const stem = basename(file.pathname, extension);
    const hash = createHash("sha256")
      .update(contents)
      .digest("hex")
      .slice(0, 8);
    const fingerprinted = `${stem}.${hash}${extension}`;
    await copyFile(file, new URL(fingerprinted, assets));
    await rm(file);
    replacements.set(
      "/assets/" + basename(file.pathname),
      "/assets/" + fingerprinted,
    );
  }
  for (const file of (await walk(output)).filter((file) =>
    /\.(?:html|js|css|xml)$/i.test(file.pathname),
  )) {
    let text = await readFile(file, "utf8"),
      next = text;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== text) await writeFile(file, next);
  }
}
await optimizeAndFingerprintImages();
console.log("Production site built in dist/");
