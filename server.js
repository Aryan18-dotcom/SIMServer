const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const STATE_FILE = path.join("/tmp", "simserver-state.json");

const defaultState = {
  currentGreeting:
    "Hello! Aryan is in a meeting right now and I am his AI assistant. Please tell me your name and message after the tone.",
  callNotes: []
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch (_) {}
  return { ...defaultState };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  } catch (_) {}
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Health check route so opening the root Vercel URL confirms the server is live
app.get("/", (req, res) => {
  const state = loadState();
  res.json({
    ok: true,
    service: "SIMServer Voice Agent Bridge",
    greeting: state.currentGreeting,
    notesCount: state.callNotes.length
  });
});

// View current greeting in browser
app.get("/config", (req, res) => {
  const state = loadState();
  res.json({ ok: true, greeting: state.currentGreeting });
});

// Sync greeting from DirectSIM Android app
app.post("/config", (req, res) => {
  const state = loadState();
  if (req.body && req.body.greeting) {
    state.currentGreeting = String(req.body.greeting).trim();
    saveState(state);
  }
  res.json({ ok: true, greeting: state.currentGreeting });
});

// Return call notes to DirectSIM Android app
app.get("/notes", (req, res) => {
  const state = loadState();
  res.json(state.callNotes);
});

// Twilio / VoIP Incoming Call Webhook (speaks directly to caller)
app.post("/voice/incoming", (req, res) => {
  const state = loadState();
  const caller = req.body.From || "Unknown Caller";
  const safeGreeting = escapeXml(state.currentGreeting);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/voice/reply?caller=${encodeURIComponent(caller)}" speechTimeout="auto">
    <Say voice="Polly.Aditi">${safeGreeting}</Say>
  </Gather>
  <Say voice="Polly.Aditi">I did not hear a response. Goodbye.</Say>
</Response>`;
  res.type("text/xml").send(twiml);
});

// Handle caller's spoken message & save note
app.post("/voice/reply", (req, res) => {
  const state = loadState();
  const caller = req.query.caller || req.body.From || "Unknown Caller";
  const speech = (req.body.SpeechResult || "").trim();
  const lower = speech.toLowerCase();

  const category =
    lower.includes("urgent") || lower.includes("emergency")
      ? "Urgent"
      : lower.includes("call back") || lower.includes("callback")
      ? "Callback"
      : "General";

  state.callNotes.unshift({
    id: Date.now(),
    callerNumber: caller,
    timestampMs: Date.now(),
    category,
    summary: speech || "Caller hung up without leaving a message.",
    transcript: `Agent: ${state.currentGreeting}\n\nCaller: ${speech || "(No speech detected)"}`
  });
  saveState(state);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi">Thank you. I have noted your message for Aryan and will notify him right away. Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.type("text/xml").send(twiml);
});

// Required for Vercel Serverless Functions
module.exports = app;

// Only bind a local port when running directly (e.g., `node server.js`)
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Voice agent bridge running on port ${port}`));
}