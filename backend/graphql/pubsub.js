/**
 * pubsub.js
 * Shared PubSub instance used to broadcast substitution events
 * to all active GraphQL subscription clients in real-time.
 *
 * By exporting a singleton here, both the route (publisher)
 * and the resolver (subscriber) share the same event bus.
 */

const { createPubSub } = require("graphql-yoga");

const pubSub = createPubSub();

// Event channel name — imported by both the route and the resolver
const SUBSTITUTION_ADDED = "SUBSTITUTION_ADDED";

module.exports = { pubSub, SUBSTITUTION_ADDED };
