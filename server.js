const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let currentGreeting =
  "Hello! Aryan is in a meeting right now and I am his AI assistant. Please tell me your name and message after the tone.";
const callNotes = [];

// Sync greeting from DirectSIM Android app
app.post("/config", (req, res) => {
  if (req.body.greeting) currentGreeting = req.body.greeting;
  res.json({ ok: true });
});

// Return call notes to DirectSIM Android app
app.get("/notes", (req, res) => {
  res.json(callNotes);
});

// Twilio / VoIP Incoming Call Webhook (speaks directly to caller)
app.post("/voice/incoming", (req, res) => {
  const caller = req.body.From || "Unknown Caller";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/voice/reply?caller=${encodeURIComponent(caller)}" speechTimeout="auto">
    <Say voice="Polly.Aditi">${currentGreeting}</Say>
  </Gather>
  <Say voice="Polly.Aditi">I did not hear a response. Goodbye.</Say>
</Response>`;
  res.type("text/xml").send(twiml);
});

// Handle caller's spoken message & save note
app.post("/voice/reply", (req, res) => {
  const caller = req.query.caller || req.body.From || "Unknown Caller";
  const speech = (req.body.SpeechResult || "").trim();
  const lower = speech.toLowerCase();

  const category =
    lower.includes("urgent") || lower.includes("emergency")
      ? "Urgent"
      : lower.includes("call back") || lower.includes("callback")
      ? "Callback"
      : "General";

  callNotes.unshift({
    id: Date.now(),
    callerNumber: caller,
    timestampMs: Date.now(),
    category,
    summary: speech || "Caller hung up without leaving a message.",
    transcript: `Agent: ${currentGreeting}\n\nCaller: ${speech || "(No speech detected)"}`
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi">Thank you. I have noted your message for Aryan and will notify him right away. Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.type("text/xml").send(twiml);
});

app.listen(process.env.PORT || 3000, () => console.log("Voice agent bridge running"));