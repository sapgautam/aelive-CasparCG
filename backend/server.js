/**
 * server.js
 * Main entry point for the CasparCG substitution backend.
 *
 * Provides two API surfaces:
 *  1. REST  — POST /substitution  (submit caption data)
 *             POST /substitution/stop  (remove caption)
 *  2. GraphQL — GET/POST /graphql
 *               · Query: logs (fetch history)
 *               · Mutation: addSubstitution
 *               · Subscription: substitutionAdded  ← real-time SSE stream
 *
 * The HTML template connects to the GraphQL subscription so it receives
 * new substitution data the instant it is posted, without polling.
 */

const express  = require("express");
const mongoose = require("mongoose");
const { createYoga, createSchema } = require("graphql-yoga");

const typeDefs  = require("./graphql/schema");
const resolvers = require("./graphql/resolvers");
const substitutionRoute = require("./routes/substitution");

const app = express();

// ── CORS (inline, no extra package needed) ─────────────────────────────────
// The HTML template runs inside CasparCG's browser engine and calls back to
// this server, so we must allow cross-origin requests.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

// ── MongoDB ────────────────────────────────────────────────────────────────
// All substitution events are persisted here for logging / audit purposes
mongoose
  .connect("mongodb://localhost:27017/caspar")
  .then(() => console.log("[MongoDB] Connected to caspar database"))
  .catch((err) => console.error("[MongoDB] Connection failed:", err.message));

// ── REST routes ────────────────────────────────────────────────────────────
app.use("/substitution", substitutionRoute);

// ── GraphQL (queries + mutations + subscriptions) ──────────────────────────
// graphql-yoga handles SSE subscriptions automatically.
// When a client sends Accept: text/event-stream, the server streams events.
const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  // Allow browsers / CasparCG template to connect cross-origin
  cors: {
    origin: "*",
    credentials: true,
  },
  // Show the GraphiQL IDE at /graphql in development
  graphiql: true,
  logging: false,
});

app.use("/graphql", yoga);

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`\n[Server] Running at http://localhost:${PORT}`);
  console.log(`[Server] GraphQL IDE  http://localhost:${PORT}/graphql`);
  console.log(`[Server] REST API     POST http://localhost:${PORT}/substitution`);
  console.log(`[Server] Stop caption POST http://localhost:${PORT}/substitution/stop\n`);
});
