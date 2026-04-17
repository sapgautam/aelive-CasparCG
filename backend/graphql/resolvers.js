/**
 * resolvers.js
 * GraphQL resolver functions — the business logic that executes
 * when a Query, Mutation, or Subscription operation is received.
 */

const Substitution = require("../models/Substitution");
const { pubSub, SUBSTITUTION_ADDED } = require("./pubsub");

const resolvers = {
  // ── Query ──────────────────────────────────────────────────────────────────
  Query: {
    /**
     * logs — returns all substitution records stored in MongoDB,
     * sorted by most recent first.
     */
    logs: async () => {
      const records = await Substitution.find().sort({ createdAt: -1 });
      // Map _id → id so GraphQL can return it as a plain string
      return records.map((r) => ({
        id: r._id.toString(),
        playerOut: r.playerOut,
        playerIn: r.playerIn,
        time: r.time,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  },

  // ── Mutation ───────────────────────────────────────────────────────────────
  Mutation: {
    /**
     * addSubstitution — persists the event to MongoDB then publishes it
     * on the PubSub channel so every active subscription receives it instantly.
     *
     * This is an alternative entry point to the REST POST /substitution route.
     * Both routes share the same PubSub instance, so either one triggers the
     * live template update.
     */
    addSubstitution: async (_, { playerOut, playerIn, time }) => {
      const saved = await Substitution.create({ playerOut, playerIn, time });

      const payload = {
        id: saved._id.toString(),
        playerOut: saved.playerOut,
        playerIn: saved.playerIn,
        time: saved.time,
        createdAt: saved.createdAt.toISOString(),
      };

      // Broadcast to all SSE subscription listeners
      pubSub.publish(SUBSTITUTION_ADDED, payload);

      return payload;
    },
  },

  // ── Subscription ───────────────────────────────────────────────────────────
  Subscription: {
    substitutionAdded: {
      /**
       * subscribe — registers this client on the PubSub channel.
       * graphql-yoga delivers each published value over SSE
       * (Server-Sent Events) to connected HTML templates.
       */
      subscribe: () => pubSub.subscribe(SUBSTITUTION_ADDED),

      // resolve passes the published payload through unchanged
      resolve: (payload) => payload,
    },
  },
};

module.exports = resolvers;
