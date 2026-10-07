// The build replaces this marker only when the uploaded video exists.
const videoSource = "__HERO_VIDEO_SOURCE__";
export function mountHeroVideo(surface) {
  if (!surface || !videoSource.startsWith("/assets/videos/")) return;
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.setAttribute("aria-hidden", "true");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hero-video-toggle";
  button.textContent = "Play background video";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const permitted = () =>
    !reduced.matches &&
    !document.documentElement.classList.contains("reduce-motion") &&
    !document.body.classList.contains("reduce-motion");
  const play = async () => {
    if (!video.src) video.src = videoSource;
    try {
      await video.play();
    } catch {
      button.textContent = "Play background video";
    }
  };
  button.addEventListener("click", () =>
    video.paused ? void play() : video.pause(),
  );
  video.addEventListener("play", () => {
    button.textContent = "Pause background video";
  });
  video.addEventListener("pause", () => {
    button.textContent = "Play background video";
  });
  video.addEventListener("error", () => {
    video.remove();
    button.remove();
  });
  surface.append(video);
  surface.parentElement.append(button);
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === "attributes" &&
          (record.target === document.documentElement ||
            record.target === document.body),
      ) &&
      !permitted()
    )
      video.pause();
    if (!surface.isConnected) {
      observer.disconnect();
      reduced.removeEventListener("change", stop);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  });
  const stop = () => {
    if (!permitted()) video.pause();
  };
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
  reduced.addEventListener("change", stop);
  if (permitted() && !navigator.connection?.saveData) void play();
}
