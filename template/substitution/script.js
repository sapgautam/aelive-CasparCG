/**
 * script.js — CasparCG Substitution Template Controller
 *
 * Two independent ways this template receives substitution data:
 *
 *  1. GraphQL Subscription (SSE)
 *     The template connects to the backend's GraphQL endpoint and subscribes
 *     to `substitutionAdded`. Whenever a new substitution is POSTed to the
 *     REST API or sent via the GraphQL mutation, this callback fires and
 *     shows the caption automatically.
 *
 *  2. CasparCG AMCP direct call
 *     CasparCG can call play(jsonString), stop(), or update(jsonString)
 *     directly from its server commands (CG INVOKE, or automatically via
 *     the play-on-load flag in CG ADD). This is the traditional CasparCG
 *     template API and works even when the backend is not running.
 *
 * Both paths converge on displaySubstitution() and animateOut().
 */

// ── Configuration ────────────────────────────────────────────────────────────
const BACKEND_URL    = "http://localhost:4000";
const AUTO_HIDE_MS   = 8000; // caption stays on air for 8 seconds

// ── State ────────────────────────────────────────────────────────────────────
let autoHideTimer    = null; // reference so we can cancel it on manual stop
let sseSource        = null; // active EventSource connection

// ── DOM refs (cached once the page loads) ───────────────────────────────────
const captionEl  = document.getElementById("caption");
const outNumber  = document.getElementById("out-number");
const outName    = document.getElementById("out-name");
const inNumber   = document.getElementById("in-number");
const inName     = document.getElementById("in-name");
const subTime    = document.getElementById("sub-time");

// ════════════════════════════════════════════════════════════════════════════
// GRAPHQL SUBSCRIPTION (SSE)
// graphql-yoga delivers subscriptions via Server-Sent Events.
// EventSource auto-reconnects on network errors.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Builds the SSE URL with the GraphQL subscription query embedded,
 * then opens an EventSource connection that stays alive.
 */
function connectSubscription() {
  const query = `
    subscription {
      substitutionAdded {
        playerOut { name number }
        playerIn  { name number }
        time
      }
    }
  `.replace(/\s+/g, " ").trim();

  // graphql-yoga listens for GET requests with Accept: text/event-stream.
  // EventSource always sends that header automatically.
  const url = `${BACKEND_URL}/graphql?query=${encodeURIComponent(query)}`;

  sseSource = new EventSource(url);

  // graphql-yoga sends plain SSE lines (no "event:" type header), so EventSource
  // dispatches them as the default "message" event — not "next"
  sseSource.addEventListener("message", (event) => {
    try {
      const envelope = JSON.parse(event.data);
      const sub = envelope.data?.substitutionAdded;
      if (sub) {
        displaySubstitution(sub);
      }
    } catch (err) {
      console.error("[SSE] Failed to parse event:", err.message);
    }
  });

  sseSource.addEventListener("error", () => {
    // EventSource handles reconnection automatically; log for debugging only
    console.warn("[SSE] Connection lost, browser will retry...");
  });

  console.log("[SSE] Subscribed to substitutionAdded");
}

// ════════════════════════════════════════════════════════════════════════════
// DISPLAY LOGIC
// ════════════════════════════════════════════════════════════════════════════

/**
 * Populates the DOM elements and triggers the slide-in animation.
 *
 * @param {{ playerOut: {name:string, number:number},
 *           playerIn:  {name:string, number:number},
 *           time: string }} data
 */
function displaySubstitution(data) {
  
  // Cancel any previous auto-hide timer so consecutive substitutions
  // each get a full 8-second display window
  clearTimeout(autoHideTimer);

  // Make sure we start from the hidden state if caption is already showing
  captionEl.classList.remove("visible", "hiding");

  // Populate content
  outNumber.textContent = data.playerOut.number;
  outName.textContent   = data.playerOut.name.toUpperCase();
  inNumber.textContent  = data.playerIn.number;
  inName.textContent    = data.playerIn.name.toUpperCase();
  subTime.textContent   = data.time;

  // Force a reflow so the browser registers the "hidden" state before
  // adding .visible — this ensures the transition always fires
  void captionEl.offsetWidth;

  // Trigger slide-in animation (CSS handles the rest)
  captionEl.classList.add("visible");

  // Schedule automatic removal after AUTO_HIDE_MS
  autoHideTimer = setTimeout(animateOut, AUTO_HIDE_MS);
}

/**
 * Triggers the slide-out animation, then resets the caption to hidden state.
 * Called automatically after AUTO_HIDE_MS, or manually by stop().
 */
function animateOut() {
  clearTimeout(autoHideTimer);

  captionEl.classList.remove("visible");
  captionEl.classList.add("hiding");

  // After the CSS transition finishes (~550ms), clean up so the
  // caption is ready for its next appearance
  setTimeout(() => {
    captionEl.classList.remove("hiding");
  }, 600);
}

// ════════════════════════════════════════════════════════════════════════════
// CASPARCG TEMPLATE API
// These global functions are called by CasparCG via AMCP commands:
//   CG <ch>-<layer> ADD 1 "substitution/index" 1 "<json>"  → triggers play()
//   CG <ch>-<layer> STOP 1                                 → triggers stop()
//   CG <ch>-<layer> INVOKE 1 "update(<json>)"              → triggers update()
// ════════════════════════════════════════════════════════════════════════════

/**
 * play(xmlOrJson) — called by CasparCG when the template is loaded with data.
 * CasparCG passes data as an XML string or a raw JSON string depending on
 * the template host version. We handle both.
 *
 * @param {string} data - JSON string e.g. '{"out":{"name":"Rohit","number":45},...}'
 */
window.play = function (data) {
  try {
     // 🚨 FIX: ignore empty/undefined data
    if (!data) {
      console.log("[play] No data received (initial call)");
      return;
    }
    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    // Normalise between REST shape {out, in, time} and GraphQL shape {playerOut, playerIn, time}
    const substitution = {
      playerOut: parsed.out      || parsed.playerOut,
      playerIn:  parsed.in       || parsed.playerIn,
      time:      parsed.time     || "",
    };

    displaySubstitution(substitution);
  } catch (err) {
    console.error("[play] Could not parse data:", err.message, data);
  }
};

/**
 * stop() — called by CasparCG when CG STOP is issued.
 * Triggers the slide-out animation.
 */
window.stop = function () {
  animateOut();
};

/**
 * update(data) — called by CasparCG when CG UPDATE is issued with new data.
 * Updates the displayed content while the caption is already visible.
 *
 * @param {string} data - same JSON format as play()
 */
window.update = function (data) {
  try {
    if (!data) return;

    console.log("[update] received:", data);

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    const substitution = {
      playerOut: parsed.out || parsed.playerOut,
      playerIn: parsed.in || parsed.playerIn,
      time: parsed.time || "",
    };

    if (!substitution.playerOut || !substitution.playerIn) {
      console.warn("[update] invalid data", parsed);
      return;
    }

    displaySubstitution(substitution);

  } catch (err) {
    console.error("[update] error:", err.message, data);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// INITIALISATION
// ════════════════════════════════════════════════════════════════════════════
// Start the GraphQL subscription as soon as the page loads.
// The caption stays hidden until data arrives via subscription or play().
connectSubscription();

// ── PREVIEW MODE (browser testing only) ─────────────────────────────────────
// Open  template/substitution/index.html?preview  in a browser to see the
// caption with sample data. CasparCG never passes URL parameters, so this
// block is never active in a live broadcast.
if (new URLSearchParams(window.location.search).has("preview")) {
  // Give the browser a dark background so the transparent caption is visible
  document.body.style.background = "#0d1117";

  // Show caption with sample data after a short delay so the entrance
  // animation plays from the correct start position
  setTimeout(() => {
    displaySubstitution({
      playerOut: { name: "Rohit Sharma", number: 45 },
      playerIn:  { name: "Virat Kohli",  number: 18 },
      time:      "65'",
    });
  }, 600);
}
