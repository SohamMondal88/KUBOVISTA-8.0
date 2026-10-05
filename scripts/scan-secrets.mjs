import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const history = process.argv.includes("--history");
const patterns = [
  [
    "server-secret",
    /^(?:RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|FIREBASE_PRIVATE_KEY)[ \t]*=[ \t]*[^\s#]{8,}/m,
  ],
  [
    "json-private-key",
    /"private_key"[ \t]*:[ \t]*"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\\n[A-Za-z0-9+/=\\n]{80,}/,
  ],
  ["credentialed-database-url", /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{8,}@/],
];

function findings(source, label) {
  return patterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([kind]) => ({ label, kind }));
}

let results = [];
if (history) {
  const patches = execFileSync(
    "git",
    ["log", "--all", "--format=commit:%H", "-p", "--", "."],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  results = findings(patches.replace(/^[+-](?=[^+-])/gm, ""), "git-history");
} else {
  const files = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    if (file === "scripts/scan-secrets.mjs") continue;
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    results.push(...findings(source, file));
  }
}

if (results.length) {
  for (const item of results)
    console.error(`Potential ${item.kind} detected in ${item.label}.`);
  process.exitCode = 1;
} else {
  console.log(
    history
      ? "No recognized secrets found in reachable Git history."
      : "No recognized secrets found in tracked files.",
  );
}
