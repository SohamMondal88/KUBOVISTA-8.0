// Vercel Web Analytics implementation
// Injects the Vercel Analytics script for real-time traffic insights
let injected = false;

export function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;

  const script = document.createElement("script");
  script.src = "/_vercel/insights/script.js";
  script.defer = true;
  script.dataset.sdkn = "@vercel/analytics";
  script.dataset.sdkv = "2.0.1";
  document.head.append(script);
}
