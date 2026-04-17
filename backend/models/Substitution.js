const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  playerOut: {
    name: String,
    number: Number,
  },
  playerIn: {
    name: String,
    number: Number,
  },
  time: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Substitution", schema);