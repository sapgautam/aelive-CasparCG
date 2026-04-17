const express = require("express");
const router = express.Router();
const Substitution = require("../models/Substitution");
const { sendToCaspar, stopCaspar } = require("../services/casparService");
const { pubSub, SUBSTITUTION_ADDED } = require("../graphql/pubsub");

// ── POST /substitution ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { outName, outNumber, inName, inNumber, time } = req.body;

    // Validate required fields before touching the DB
    if (!outName || !outNumber || !inName || !inNumber || !time) {
      return res.status(400).json({
        error: "Missing required fields: outName, outNumber, inName, inNumber, time",
      });
    }

    // Build the document that matches the Mongoose Substitution schema
    const data = {
      playerOut: { name: outName, number: parseInt(outNumber, 10) },
      playerIn:  { name: inName,  number: parseInt(inNumber,  10) },
      time,
    };

    // ① Persist to MongoDB for audit / historical log
    const saved = await Substitution.create(data);

    // ② Publish to GraphQL PubSub — all SSE subscription clients
    //    (i.e. the running HTML templates) receive this instantly
    pubSub.publish(SUBSTITUTION_ADDED, {
      id:        saved._id.toString(),
      playerOut: saved.playerOut,
      playerIn:  saved.playerIn,
      time:      saved.time,
      createdAt: saved.createdAt.toISOString(),
    });

    // ③ Send CasparCG AMCP command to load the template on the broadcast channel
    sendToCaspar({
      out:  data.playerOut,
      in:   data.playerIn,
      time: data.time,
    });

    res.json({ success: true, data: saved });
  } catch (err) {
    console.error("Error in POST /substitution:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /substitution/stop ───────────────────────────────────────────────────
router.post("/stop", (req, res) => {
  try {
    // Sends CG STOP to CasparCG — triggers the out-animation in the template
    stopCaspar();
    res.json({ success: true, message: "Stop command sent to CasparCG" });
  } catch (err) {
    console.error("Error in POST /substitution/stop:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
