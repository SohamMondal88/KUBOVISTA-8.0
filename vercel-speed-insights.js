let injected = false;

export function injectSpeedInsights() {
  if (injected || typeof document === "undefined") return;
  injected = true;

  const script = document.createElement("script");
  script.src = "/_vercel/speed-insights/script.js";
  script.defer = true;
  script.dataset.sdkn = "@vercel/speed-insights";
  document.head.append(script);
}
