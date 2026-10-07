import { groundedKnowledge } from "./grounded-knowledge.js";
import { guideAnswer, quickPrompts } from "./kubo-knowledge.js";
export function mountKubo() {
  const mascot =
    '<span class="kubo-face" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 11.5a8 8 0 0 1-8 8H4l1.7-3.4A8 8 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/></svg></span>';
  const launcher = document.createElement("button");
  launcher.className = "kubo-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask Kubo, your travel companion");
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.innerHTML = mascot + "<span>Ask Kubo</span>";
  document.body.append(launcher);
  const dialog = document.createElement("dialog");
  dialog.id = "kubo-dialog";
  dialog.className = "kubo-dialog";
  dialog.setAttribute("aria-labelledby", "kubo-title");
  dialog.innerHTML = `<div class="kubo-head">${mascot}<div><h2 id="kubo-title">Kubo <span>TRAVEL COMPANION</span></h2><p id="kubo-mode-label">Built-in guide · Ready to explore</p></div><button class="icon-button" id="kubo-close" aria-label="Close Kubo">✕</button></div><div class="kubo-toolbar"><label class="sr-only" for="kubo-mode">Conversation mode</label><select id="kubo-mode"><option value="guide">Built-in guide</option><option value="ai" disabled>OpenAI chat · Checking availability</option><option value="firebase-ai" disabled>Firebase AI Logic · Not activated</option></select><button id="kubo-clear" type="button">New chat ↺</button><button id="kubo-download" type="button" aria-label="Download this conversation">↓</button></div><div class="kubo-consent" hidden><label><input type="checkbox" id="kubo-consent"> Share your question with the selected AI provider to generate a reply. Don’t include private account, identity or payment details.</label><a href="/legal/privacy">Privacy details ↗</a></div><div class="kubo-feed" id="kubo-feed" role="log" aria-label="Conversation with Kubo" aria-live="polite" aria-relevant="additions"></div><div class="kubo-status" id="kubo-status" role="status"></div><form class="kubo-composer"><label class="sr-only" for="kubo-input">Your travel question</label><textarea id="kubo-input" maxlength="1200" rows="2" placeholder="Ask about a destination or your trip…" required></textarea><div><span id="kubo-counter">0 / 1200</span><button type="button" id="kubo-stop" hidden>Stop</button><button type="submit" id="kubo-send" aria-label="Send question to Kubo">Send ↗</button></div></form><div class="kubo-foot"><span>AI can make mistakes. Confirm trip details with our team.</span><a href="/company/contact">Talk to a human ↗</a></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  const feed = $("#kubo-feed"),
    input = $("#kubo-input"),
    status = $("#kubo-status"),
    mode = $("#kubo-mode");
  let history = [],
    controller = null,
    sequence = 0,
    busy = false,
    returnFocus = launcher,
    lastFailed = "";
  function open(from = launcher) {
    returnFocus = from;
    document.dispatchEvent(new Event("kubo:open"));
    if (!dialog.open) dialog.showModal();
    input.focus();
  }
  function close() {
    dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  launcher.addEventListener("click", () => open());
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-kubo]");
    if (b) open(b);
  });
  $("#kubo-close").addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        close();
    }
    if (e.target.closest("a")) close();
  });
  function message(role, text, links = [], label = "") {
    const item = document.createElement("div");
    item.className = "kubo-message " + role;
    const who = document.createElement("span");
    who.className = "kubo-speaker";
    who.textContent =
      role === "user" ? "YOU" : label || "KUBO · BUILT-IN GUIDE";
    const p = document.createElement("p");
    p.textContent = text;
    item.append(who, p);
    if (links.length) {
      const group = document.createElement("div");
      group.className = "kubo-links";
      for (const link of links.slice(0, 5)) {
        if (
          !/^\/?(?:#\/)?[a-z0-9/?=&%-]*$/i.test(link.href) ||
          !link.href.startsWith("/")
        )
          continue;
        const a = document.createElement("a");
        a.href = link.href;
        a.textContent = link.label + " ↗";
        group.append(a);
      }
      item.append(group);
    }
    feed.append(item);
    feed.scrollTop = feed.scrollHeight;
    return item;
  }
  function welcome() {
    feed.replaceChildren();
    const box = document.createElement("div");
    box.className = "kubo-welcome";
    box.innerHTML = `<span class="eyebrow">YOUR TRAVEL ASSISTANT</span><h3>How can I help?</h3><p>Hi, I’m Kubo. Let’s find your place, shape your itinerary and make the details a little easier.</p><div class="kubo-prompts"></div><p class="kubo-memory">This chat stays in memory until you refresh or start a new chat. AI modes send your question or recent conversation to the chosen provider only with your consent.</p>`;
    for (const prompt of quickPrompts) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = prompt + " ↗";
      b.addEventListener("click", () => send(prompt));
      box.querySelector(".kubo-prompts").append(b);
    }
    feed.append(box);
  }
  function setBusy(value) {
    busy = value;
    $("#kubo-send").disabled = value;
    $("#kubo-stop").hidden = !value;
    mode.disabled = value;
    feed
      .querySelectorAll(".kubo-prompts button")
      .forEach((b) => (b.disabled = value));
  }
  function reset() {
    sequence++;
    controller?.abort();
    history = [];
    lastFailed = "";
    setBusy(false);
    status.replaceChildren();
    input.value = "";
    $("#kubo-counter").textContent = "0 / 1200";
    welcome();
    input.focus();
  }
  function conversation() {
    let selected = history
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    while (selected.reduce((n, m) => n + m.content.length, 0) > 11000)
      selected.shift();
    return selected;
  }
  async function send(text, retry = false) {
    text = text.trim();
    if (!text || busy) return;
    if (text.length > 1200) {
      status.textContent = "Please keep your question within 1200 characters.";
      return;
    }
    if (mode.value !== "guide" && !$("#kubo-consent").checked) {
      status.textContent =
        "Please review and select the sharing checkbox to use AI chat, or choose the built-in guide.";
      $("#kubo-consent").focus();
      return;
    }
    const token = ++sequence;
    lastFailed = "";
    if (!retry) {
      message("user", text);
      history.push({ role: "user", content: text });
      history = history.slice(-40);
    }
    input.value = "";
    $("#kubo-counter").textContent = "0 / 1200";
    status.replaceChildren();
    setBusy(true);
    try {
      let answer;
      if (mode.value === "guide") {
        answer = guideAnswer(history);
      } else if (mode.value === "firebase-ai") {
        const [{ auth, apiFetch }, { firebaseTravelAnswer }] =
          await Promise.all([
            import("/firebase-auth-client.js"),
            import("/firebase-client.js"),
          ]);
        if (!auth.currentUser?.emailVerified)
          throw Error(
            "Sign in with a verified email to use Firebase AI Logic.",
          );
        status.textContent = "Kubo is reading the public travel guides…";
        await apiFetch("/api/auth/get-session");
        answer = await firebaseTravelAnswer(text, groundedKnowledge(text));
      } else {
        const { apiFetch } = await import("/firebase-auth-client.js");
        controller = new AbortController();
        status.textContent = "Kubo is putting your travel notes together…";
        const timeout = setTimeout(() => controller?.abort(), 35000);
        let response;
        try {
          response = await apiFetch("/api/config?service=kubo", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: conversation(), consent: true }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        const data = await response.json();
        if (token !== sequence) return;
        if (!response.ok) {
          if (response.status === 401) {
            message(
              "assistant",
              "Sign in to use AI chat. The built-in guide is available without an account.",
              [{ label: "Sign in", href: "/account/login" }],
            );
          }
          throw Error(
            data.error || "The AI service is temporarily unavailable.",
          );
        }
        answer = data;
      }
      if (token !== sequence) return;
      message(
        "assistant",
        answer.text,
        answer.links,
        answer.mode === "ai"
          ? "KUBO · OPENAI RESPONSE"
          : answer.mode === "firebase-ai"
            ? "KUBO · FIREBASE AI RESPONSE"
            : "KUBO · BUILT-IN GUIDE",
      );
      history.push({ role: "assistant", content: answer.text });
      status.textContent =
        answer.mode === "ai"
          ? `${answer.remaining} AI requests remaining today. Confirm important details with the team.`
          : answer.mode === "firebase-ai"
            ? "Firebase AI Logic answer. Confirm important details with the team."
            : "From KuboVistas’s built-in travel guide.";
    } catch (error) {
      if (token !== sequence) return;
      lastFailed = text;
      status.textContent =
        error.name === "AbortError"
          ? "Reply stopped or timed out. You can retry or use the built-in guide."
          : error.message;
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", () => send(lastFailed, true));
      status.append(retryButton);
      const guide = document.createElement("button");
      guide.type = "button";
      guide.textContent = "Use built-in guide";
      guide.addEventListener("click", () => {
        mode.value = "guide";
        syncMode();
        send(lastFailed, true);
      });
      status.append(guide);
    } finally {
      if (token === sequence) {
        setBusy(false);
        controller = null;
      }
    }
  }
  function syncMode() {
    $(".kubo-consent").hidden = mode.value === "guide";
    $("#kubo-mode-label").textContent =
      mode.value === "ai"
        ? "AI chat · Powered by OpenAI"
        : mode.value === "firebase-ai"
          ? "AI chat · Firebase AI Logic"
          : "Built-in guide · Ready to explore";
  }
  mode.addEventListener("change", syncMode);
  $("#kubo-clear").addEventListener("click", reset);
  $("#kubo-stop").addEventListener("click", () => controller?.abort());
  $(".kubo-composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener(
    "input",
    () => ($("#kubo-counter").textContent = `${input.value.length} / 1200`),
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  $("#kubo-download").addEventListener("click", () => {
    if (!history.length) {
      status.textContent =
        "Ask Kubo a question first, then download your conversation.";
      return;
    }
    const blob = new Blob(
      [
        "KuboVistas · Kubo travel notes\nNot a quotation or booking confirmation.\n\n" +
          history
            .map((m) => (m.role === "user" ? "You" : "Kubo") + ": " + m.content)
            .join("\n\n"),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Kubo-travel-notes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  welcome();
  const firebaseOption = mode.querySelector('[value="firebase-ai"]');
  firebaseOption.disabled = !document.querySelector(
    'meta[name="kubovistas-firebase-ai-model"]',
  );
  firebaseOption.textContent = firebaseOption.disabled
    ? "Firebase AI Logic · Not activated"
    : "Firebase AI Logic · Verified sign-in required";
  fetch("/api/config?service=kubo", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const option = mode.querySelector('[value="ai"]');
      option.disabled = !data?.ai;
      option.textContent = data?.ai
        ? "AI chat · Sign-in required"
        : "AI chat · Not activated";
    })
    .catch(() => {
      mode.querySelector('[value="ai"]').textContent = "AI chat · Unavailable";
    });
}
