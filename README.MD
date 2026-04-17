# CasparCG Substitution Caption System

A real-time **live sports broadcast caption** system that displays player substitution graphics over a video feed using the CasparCG broadcast engine.

Built as a technical assessment for **aelive** — demonstrates end-to-end integration of a Node.js/GraphQL backend with a professional HTML5/CSS3 broadcast template.

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [Tech Stack and Why](#2-tech-stack-and-why)
3. [System Design & Architecture](#3-system-design--architecture)
4. [Project Structure](#4-project-structure)
5. [Local Setup — Step by Step](#5-local-setup--step-by-step)
6. [Running & Testing Without CasparCG](#6-running--testing-without-casparcg)
7. [Running With CasparCG](#7-running-with-casparcg)
8. [All the Ways to Trigger a Caption](#8-all-the-ways-to-trigger-a-caption)
9. [GraphQL API Reference](#9-graphql-api-reference)
10. [REST API Reference](#10-rest-api-reference)
11. [CasparCG AMCP Command Reference](#11-casparcg-amcp-command-reference)
12. [Caption Animation Behaviour](#12-caption-animation-behaviour)
13. [Key Design Decisions](#13-key-design-decisions)

---

## 1. What This Project Does

When a football player is substituted, a broadcast operator runs `node test-caspar.js` (or calls the REST API). Within milliseconds:

1. The event is **saved to MongoDB** as a permanent log
2. A **GraphQL subscription** pushes the data live to any connected HTML template
3. A **CasparCG AMCP command** loads the HTML template on the broadcast channel
4. The template **animates in** with player OUT info, player IN info, and match time
5. After **8 seconds** (or a manual stop command), the caption **animates out**

The graphic is a 1920×1080 transparent overlay composited on top of the live video feed by CasparCG.

---

## 2. Tech Stack and Why

### Backend

| Technology | Version | Why it was chosen |
|---|---|---|
| **Node.js** | 22.x | Non-blocking I/O is ideal for real-time broadcast pipelines; no thread management overhead |
| **Express** | 4.18 | Minimal HTTP server — just enough to expose the REST and GraphQL endpoints |
| **graphql-yoga** | 3.9 | Ships with built-in SSE subscription support out of the box — no separate WebSocket server needed |
| **MongoDB + Mongoose** | 7.x | Schema-flexible document store; substitution logs are append-only, no relational joins needed |

### Template (runs inside CasparCG)

| Technology | Why it was chosen |
|---|---|
| **HTML5 + CSS3** | CasparCG's built-in Chromium browser renders standard web pages — no plugin required |
| **Vanilla JavaScript** | Zero build step; the template is served as a static file from CasparCG's own template folder |
| **CSS Transitions** | GPU-accelerated `transform` animations give smooth broadcast-quality motion with zero JS animation libraries |
| **EventSource (SSE)** | Native browser API, no library needed; auto-reconnects if the connection drops |
| **Google Fonts — Roboto** | Material Design typeface; clean, readable at broadcast resolution (1920×1080) |

### Why GraphQL Subscriptions (not polling or WebSockets)?

The assessment specifically required GraphQL Subscriptions. Subscriptions push data from server to client the instant it changes — ideal for live broadcast where a 500ms polling delay would be noticeable on screen.

graphql-yoga v3 delivers subscriptions over **SSE (Server-Sent Events)** which uses a plain HTTP connection — simpler than WebSockets, works through proxies, and `EventSource` is built into every modern browser with automatic reconnection.

### Why not use WebSockets directly?

SSE is one-directional (server → client) which is exactly what we need here. The template only *receives* data; it never sends anything back. SSE is lighter and more appropriate than a full bidirectional WebSocket.

---

## 3. System Design & Architecture

### End-to-End Data Flow

```
Operator / test-caspar.js
         │
         │  POST /substitution
         │  { outName, outNumber, inName, inNumber, time }
         ▼
┌─────────────────────────────────────────────────────────┐
│                  Express Backend  :4000                  │
│                                                         │
│  ① Validate input                                       │
│  ② Mongoose → Save to MongoDB  (audit log)              │
│  ③ pubSub.publish('SUBSTITUTION_ADDED', payload)        │
│  ④ TCP socket → CasparCG :5250  (AMCP CG ADD command)   │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
           │ SSE stream                │ TCP AMCP
           │ (GraphQL subscription)    │ CG 1-10 ADD 1 "substitution/index" 1 "<json>"
           ▼                           ▼
┌─────────────────────┐    ┌────────────────────────────┐
│  HTML Template      │    │  CasparCG Server  :5250    │
│  (in CasparCG's     │    │                            │
│   Chromium browser) │    │  Loads template into its   │
│                     │    │  Chromium engine            │
│  EventSource fires  │    │  Calls window.play(data)   │
│  → displaySub()     │    │  → displaySub()            │
│  → CSS slide-in     │    │  → CSS slide-in            │
└─────────────────────┘    └────────────────────────────┘
           │                           │
           └───────────────────────────┘
                    Both paths converge on
                    the same displaySubstitution()
                    function in script.js
```

### Two Independent Update Paths

The template supports **two independent ways** to receive data. They both call the same `displaySubstitution()` function:

```
Path A — Backend API (recommended)
══════════════════════════════════════════════════════
REST POST /substitution
    → MongoDB save
    → GraphQL PubSub publish
        → SSE stream
            → EventSource "message" event in template
                → displaySubstitution(data)
    → CasparCG AMCP CG ADD
        → window.play(data) called by CasparCG
            → displaySubstitution(data)


Path B — Direct CasparCG AMCP (bypasses backend)
══════════════════════════════════════════════════════
Raw TCP to :5250
    CG 1-10 ADD 1 "substitution/index" 1 "<json>"
        → window.play(data) called by CasparCG
            → displaySubstitution(data)
    ⚠ Nothing saved to MongoDB
    ⚠ GraphQL subscription does NOT fire
```

> **Important:** Always use Path A (the REST API or `test-caspar.js`) for production. Path B is useful for testing the CasparCG connection in isolation, but skips all backend logic.

### GraphQL Schema

```graphql
type Player        { name: String, number: Int }

type Substitution  { id: ID, playerOut: Player, playerIn: Player,
                     time: String, createdAt: String }

type Query         { logs: [Substitution] }           # fetch history

type Mutation      { addSubstitution(...): Substitution }  # GraphQL entry point

type Subscription  { substitutionAdded: Substitution } # live stream via SSE
```

### MongoDB Document

```json
{
  "_id": "...",
  "playerOut": { "name": "Rohit Sharma", "number": 45 },
  "playerIn":  { "name": "Virat Kohli",  "number": 18 },
  "time": "65'",
  "createdAt": "2026-04-17T05:53:13.560Z"
}
```

---

## 4. Project Structure

```
casparcg-custom/
│
├── backend/                        Node.js/Express backend
│   ├── server.js                   Entry point — Express + MongoDB + graphql-yoga
│   ├── package.json
│   │
│   ├── graphql/
│   │   ├── pubsub.js               Singleton PubSub instance (shared event bus)
│   │   ├── schema.js               GraphQL SDL — Query, Mutation, Subscription types
│   │   └── resolvers.js            Resolver functions for all three operation types
│   │
│   ├── models/
│   │   └── Substitution.js         Mongoose schema + model
│   │
│   ├── routes/
│   │   └── substitution.js         POST /substitution  +  POST /substitution/stop
│   │
│   └── services/
│       └── casparService.js        TCP client — sendToCaspar() and stopCaspar()
│
├── template/
│   └── substitution/               ← copy this entire folder to CasparCG/template/
│       ├── index.html              1920×1080 transparent broadcast canvas
│       ├── style.css               Broadcast design + CSS in/out animations
│       └── script.js               SSE subscription + CasparCG play/stop/update API
│
├── test-caspar.js                  Quick test script — POSTs to the backend API
└── README.MD                       This file
```

---

## 5. Local Setup — Step by Step

### Prerequisites

- **Node.js 16+** — https://nodejs.org
- **MongoDB Community Server** — https://www.mongodb.com/try/download/community
- **CasparCG Server 2.3+** — https://casparcg.com/download *(optional for browser-only testing)*

---

### Step 1 — Start MongoDB

**Windows (service):**
```
net start MongoDB
```

**Windows (manual):**
```
mongod --dbpath C:\data\db
```

Verify it's running: open a new terminal and type `mongosh` — you should see a `>` prompt.

---

### Step 2 — Install backend dependencies

```bash
cd backend
npm install
```

---

### Step 3 — Start the backend server

```bash
node server.js
```

Expected output:
```
[Server] Running at http://localhost:4000
[Server] GraphQL IDE  http://localhost:4000/graphql
[Server] REST API     POST http://localhost:4000/substitution
[Server] Stop caption POST http://localhost:4000/substitution/stop

[MongoDB] Connected to caspar database
```

Leave this terminal open.

---

### Step 4 — Deploy the HTML template *(for CasparCG use)*

Copy the template folder into CasparCG's template directory:

```
Source:      <this-repo>\template\substitution\
Destination: C:\CasparCG\template\substitution\
```

Final result:
```
C:\CasparCG\template\
  substitution\
    index.html
    style.css
    script.js
```

---

### Step 5 — Configure CasparCG *(if using CasparCG)*

Open `C:\CasparCG\casparcg.config` and make sure a channel and consumer are defined:

```xml
<configuration>
  <channels>
    <channel>
      <video-mode>1080i5000</video-mode>
      <consumers>
        <!-- Screen preview window — for development/demo -->
        <screen>
          <device>1</device>
          <stretch>uniform</stretch>
        </screen>
        <!-- For production replace the above with your Decklink consumer -->
      </consumers>
    </channel>
  </channels>
</configuration>
```

Start CasparCG:
```
cd C:\CasparCG
casparcg.exe
```

Wait for: `**** Server is ready ****`

---

## 6. Running & Testing Without CasparCG

You can see the full caption design and test the complete backend stack (MongoDB + GraphQL subscriptions) in a regular browser — no CasparCG required.

### Option A — Preview mode (instant visual check)

Open this URL in Chrome or Edge:
```
file:///C:/Users/R240953/Downloads/casparcg-custom/casparcg-custom/template/substitution/index.html?preview
```

The `?preview` parameter tells the template to show sample data immediately with the slide-in animation. The background turns dark so the caption is visible in the browser.

---

### Option B — Live end-to-end test (backend + subscription + caption)

1. Make sure the backend is running (`node server.js`)
2. Open the template in Chrome **without** `?preview`:
   ```
   file:///C:/Users/R240953/Downloads/casparcg-custom/casparcg-custom/template/substitution/index.html
   ```
   *(Page looks blank — correct. Background is transparent and caption is off-screen until data arrives.)*

3. In another terminal, run the test script:
   ```bash
   node test-caspar.js
   ```

4. Watch the caption slide in on the browser tab within ~1 second.

5. It disappears automatically after 8 seconds. To remove it early:
   ```bash
   curl -X POST http://localhost:4000/substitution/stop
   ```

---

### Option C — GraphQL Playground

Open `http://localhost:4000/graphql` in a browser.

Run a subscription in the GraphiQL IDE:
```graphql
subscription {
  substitutionAdded {
    playerOut { name number }
    playerIn  { name number }
    time
    createdAt
  }
}
```

In a separate terminal, fire a substitution:
```bash
node test-caspar.js
```

The GraphiQL panel will show the incoming event in real time.

---

## 7. Running With CasparCG

Once CasparCG is running and the template is deployed:

```bash
# From the project root
node test-caspar.js
```

CasparCG will:
1. Load `substitution/index.html` into its Chromium engine
2. Call `window.play(data)` with the substitution JSON
3. The caption animates onto the broadcast output

To stop it manually via CasparCG:
```bash
curl -X POST http://localhost:4000/substitution/stop
```

Or from the CasparCG console / CasparCG Client:
```
CG 1-10 STOP 1
```

---

## 8. All the Ways to Trigger a Caption

The system supports four independent trigger methods. Methods 1–3 all go through the backend and save to MongoDB. Method 4 bypasses the backend entirely.

### Method 1 — test-caspar.js (quickest for testing)

```bash
node test-caspar.js
```

Edit the player names/numbers at the top of the file before running.

---

### Method 2 — REST API (curl)

```bash
curl -X POST http://localhost:4000/substitution \
  -H "Content-Type: application/json" \
  -d '{
    "outName":   "Rohit Sharma",
    "outNumber": 45,
    "inName":    "Virat Kohli",
    "inNumber":  18,
    "time":      "65'"'"'"
  }'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:4000/substitution" `
  -ContentType "application/json" `
  -Body '{"outName":"Rohit Sharma","outNumber":45,"inName":"Virat Kohli","inNumber":18,"time":"65\'"}'
```

---

### Method 3 — GraphQL Mutation

Open `http://localhost:4000/graphql` and run:

```graphql
mutation {
  addSubstitution(
    playerOut: { name: "Rohit Sharma", number: 45 }
    playerIn:  { name: "Virat Kohli",  number: 18 }
    time: "65'"
  ) {
    id
    createdAt
  }
}
```

---

### Method 4 — Direct CasparCG AMCP command *(bypasses backend)*

> ⚠️ Use this only for raw CasparCG connection testing. Nothing is saved to MongoDB and the GraphQL subscription does not fire.

Connect to CasparCG on TCP port 5250 (via CasparCG Client, Telnet, or a Node socket) and send:

```
CG 1-10 ADD 1 "substitution/index" 1 "{\"out\":{\"name\":\"Rohit Sharma\",\"number\":45},\"in\":{\"name\":\"Virat Kohli\",\"number\":18},\"time\":\"65'\"}"
```

To stop:
```
CG 1-10 STOP 1
```

---

### Stopping the caption

| Method | Command |
|---|---|
| REST API | `curl -X POST http://localhost:4000/substitution/stop` |
| CasparCG AMCP | `CG 1-10 STOP 1` |
| Automatic | Caption hides itself after 8 seconds |

---

## 9. GraphQL API Reference

Base URL: `http://localhost:4000/graphql`

Open the browser at this URL to access the **GraphiQL IDE** — an interactive playground where you can run all operations below.

### Query — fetch substitution history

```graphql
query {
  logs {
    id
    playerOut { name number }
    playerIn  { name number }
    time
    createdAt
  }
}
```

### Mutation — trigger a substitution

```graphql
mutation {
  addSubstitution(
    playerOut: { name: "Rohit Sharma", number: 45 }
    playerIn:  { name: "Virat Kohli",  number: 18 }
    time: "65'"
  ) {
    id
    time
    createdAt
  }
}
```

### Subscription — live stream

```graphql
subscription {
  substitutionAdded {
    playerOut { name number }
    playerIn  { name number }
    time
    createdAt
  }
}
```

**Transport:** Server-Sent Events (SSE). graphql-yoga exposes this on the same `/graphql` endpoint — no separate WebSocket port needed. The HTML template connects via `EventSource` using a `GET` request with `Accept: text/event-stream`.

---

## 10. REST API Reference

Base URL: `http://localhost:4000`

### POST `/substitution` — create a substitution

**Request body:**
```json
{
  "outName":   "Rohit Sharma",
  "outNumber": 45,
  "inName":    "Virat Kohli",
  "inNumber":  18,
  "time":      "65'"
}
```

**Success response `200`:**
```json
{
  "success": true,
  "data": {
    "_id": "69e1d39e2f83ea1ebe0ea581",
    "playerOut": { "name": "Rohit Sharma", "number": 45 },
    "playerIn":  { "name": "Virat Kohli",  "number": 18 },
    "time": "65'",
    "createdAt": "2026-04-17T05:53:13.560Z"
  }
}
```

**Error response `400`:**
```json
{ "error": "Missing required fields: outName, outNumber, inName, inNumber, time" }
```

---

### POST `/substitution/stop` — remove the caption

No request body needed.

**Success response:**
```json
{ "success": true, "message": "Stop command sent to CasparCG" }
```

---

## 11. CasparCG AMCP Command Reference

CasparCG uses the **AMCP (Advanced Media Control Protocol)** — plain text commands sent over TCP port 5250, terminated with `\r\n`.

| Action | AMCP Command |
|---|---|
| Load & play template | `CG 1-10 ADD 1 "substitution/index" 1 "<json>"` |
| Stop & remove | `CG 1-10 STOP 1` |
| Update data while visible | `CG 1-10 UPDATE 1 "<json>"` |
| Call any JS function | `CG 1-10 INVOKE 1 "stop()"` |
| Remove without animation | `CG 1-10 REMOVE 1` |

**Command breakdown — `CG 1-10 ADD 1 "substitution/index" 1 "<json>"`:**

| Part | Meaning |
|---|---|
| `CG` | Character Generator command |
| `1-10` | Channel 1, layer 10 (adjust to match your `casparcg.config`) |
| `ADD` | Load a new template |
| `1` | CG layer index within the channel |
| `"substitution/index"` | Template path relative to CasparCG's `template/` folder |
| `1` | play-on-load flag — `1` means call `window.play(data)` immediately |
| `"<json>"` | Data string passed to `window.play()` in the template |

---

## 12. Caption Animation Behaviour

```
0ms       Caption enters from the left
          ↓ transform: translateX(-110%) → translateX(0)
          ↓ opacity: 0 → 1
          ↓ Easing: cubic-bezier(0.16, 1, 0.3, 1)  — fast snap in

+380ms    Player OUT row fades + slides in (staggered)
+520ms    Player IN row fades + slides in (staggered)

+8000ms   animateOut() fires automatically
          ↓ transform: translateX(0) → translateX(-115%)
          ↓ opacity: 1 → 0
          ↓ Easing: cubic-bezier(0.7, 0, 0.84, 0)  — smooth slide out

+8600ms   Classes reset — caption ready for next appearance
```

The caption can be removed early at any point by calling `POST /substitution/stop` or `CG 1-10 STOP 1`.

Calling `POST /substitution` while the caption is already visible immediately resets it with the new data and a fresh 8-second timer.

---

## 13. Key Design Decisions

**Why two trigger paths (SSE + direct AMCP)?**
The SSE subscription path is the primary production path — it saves to MongoDB and gives a full audit trail. The direct AMCP `play()` path is a fallback that works even if the backend is down (e.g. testing CasparCG connectivity independently).

**Why a singleton PubSub (`backend/graphql/pubsub.js`)?**
Both the REST route (`routes/substitution.js`) and the GraphQL mutation resolver (`graphql/resolvers.js`) need to publish to the same event bus. Exporting a single `createPubSub()` instance ensures they share the same channel.

**Why no `cors` npm package?**
The three CORS headers needed are set inline in `server.js` — adding a package for three lines would be unnecessary overhead.

**Why 1920×1080 transparent canvas?**
CasparCG composites the HTML template over the video feed. The template must be exactly the broadcast resolution with a transparent background so only the caption itself appears on screen, not a coloured box behind it.

**Why `void captionEl.offsetWidth` before adding `.visible`?**
Browsers batch DOM changes. Without forcing a reflow, if `.hiding` and `.visible` are toggled in the same frame the transition never fires because the browser never registers the intermediate "hidden" state.
