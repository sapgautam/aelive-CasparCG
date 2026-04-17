const http = require("http");

// ── Substitution data to test with ───────────────────────────────────────────
const substitutionData = {
  outName:   "Rohit Sharma",
  outNumber: 45,
  inName:    "Virat Kohli",
  inNumber:  18,
  time:      "65'",
};

// ── POST to the backend API ───────────────────────────────────────────────────
const body = JSON.stringify(substitutionData);

const options = {
  hostname: "localhost",
  port:     4000,
  path:     "/substitution",
  method:   "POST",
  headers: {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
};

console.log("Sending substitution to backend API...");
console.log("  Player OUT:", substitutionData.outName, "#" + substitutionData.outNumber);
console.log("  Player IN: ", substitutionData.inName,  "#" + substitutionData.inNumber);
console.log("  Time:      ", substitutionData.time);
console.log("");

const req = http.request(options, (res) => {
  let responseBody = "";

  res.on("data", (chunk) => {
    responseBody += chunk;
  });

  res.on("end", () => {
    const result = JSON.parse(responseBody);

    if (result.success) {
      console.log("✅ Saved to MongoDB  — ID:", result.data._id);
      console.log("✅ GraphQL subscription published  — HTML template will update");
      console.log("✅ CasparCG AMCP command sent  — template loading on channel 1-10");
    } else {
      console.error("❌ Error from backend:", result.error);
    }
  });
});

req.on("error", (err) => {
  console.error("❌ Could not reach backend:", err.message);
  console.error("   → Make sure the backend is running: cd backend && node server.js");
});

req.write(body);
req.end();
