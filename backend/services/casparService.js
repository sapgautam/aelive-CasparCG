/**
 * casparService.js
 * Handles communication with the CasparCG server over TCP using the
 * AMCP (Advanced Media Control Protocol) — a plain-text, line-based protocol.
 *
 * All commands are sent as a single TCP connection per command (stateless).
 * CasparCG listens on port 5250 by default.
 */

const net = require("net");

// ── Connection settings ────────────────────────────────────────────────────
const CASPAR_HOST     = "127.0.0.1"; // CasparCG server IP (same machine)
const CASPAR_PORT     = 5250;        // Default CasparCG AMCP port
const CHANNEL         = 1;           // Video channel (1-based)
const CHANNEL_LAYER   = 10;          // Compositing layer on that channel (higher = on top)
const CG_LAYER        = 1;           // CasparCG CG (Character Generator) layer index

/**
 * Opens a short-lived TCP socket, sends one AMCP command, then closes.
 * @param {string} command - A valid AMCP command string (without trailing CRLF)
 */
function sendAMCPCommand(command) {
  const client = new net.Socket();

  client.connect(CASPAR_PORT, CASPAR_HOST, () => {
    console.log(`[CasparCG] Sending: ${command}`);
    // AMCP commands must end with \r\n
    client.write(command + "\r\n");
    // Allow CasparCG a moment to process before we close the socket
    setTimeout(() => client.destroy(), 300);
  });

  client.on("error", (err) => {
    console.error(`[CasparCG] Connection error: ${err.message}`);
    console.error("  → Is CasparCG running on port 5250?");
  });
}

/**
 * sendToCaspar — loads and plays the substitution HTML template in CasparCG.
 *
 * AMCP command used:
 *   CG <channel>-<layer> ADD <cg-layer> "<template>" <play-on-load> "<data>"
 *
 *   - play-on-load = 1  means the template's play() function is called immediately
 *   - <data>           is a JSON string passed to the template's play() function
 *
 * @param {{ out: {name:string, number:number}, in: {name:string, number:number}, time:string }} data
 */
function sendToCaspar(data) {
  // Escape inner quotes so the JSON can sit inside the outer quoted AMCP argument
  const jsonData = JSON.stringify(data).replace(/"/g, '\\"');
  const command  = `CG ${CHANNEL}-${CHANNEL_LAYER} ADD ${CG_LAYER} "substitution/index" 1 "${jsonData}"`;
  sendAMCPCommand(command);
}

/**
 * stopCaspar — removes the substitution template from the broadcast output.
 *
 * AMCP command used:
 *   CG <channel>-<layer> STOP <cg-layer>
 *
 * CasparCG calls the template's stop() function before unloading it,
 * which triggers the CSS slide-out animation.
 */
function stopCaspar() {
  const command = `CG ${CHANNEL}-${CHANNEL_LAYER} STOP ${CG_LAYER}`;
  sendAMCPCommand(command);
}

module.exports = { sendToCaspar, stopCaspar };
