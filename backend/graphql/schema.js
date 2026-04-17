const typeDefs = `
  # Represents one player (out or in)
  type Player {
    name: String
    number: Int
  }

  # A single substitution event stored in MongoDB
  type Substitution {
    id: ID
    playerOut: Player
    playerIn: Player
    time: String
    createdAt: String
  }

  # Input type re-used by the mutation
  input PlayerInput {
    name: String!
    number: Int!
  }

  # ── Queries ─────────────────────────────────────────────────────────────────
  type Query {
    # Return all substitutions from the database, newest first
    logs: [Substitution]
  }

  # ── Mutations ────────────────────────────────────────────────────────────────
  type Mutation {
    # Save a substitution to the DB and push it to all subscription listeners
    addSubstitution(
      playerOut: PlayerInput!
      playerIn: PlayerInput!
      time: String!
    ): Substitution
  }

  # ── Subscriptions ────────────────────────────────────────────────────────────
  type Subscription {
    # Fires whenever a new substitution is created.
    # The HTML template subscribes here via SSE to receive live data.
    substitutionAdded: Substitution
  }
`;

module.exports = typeDefs;
