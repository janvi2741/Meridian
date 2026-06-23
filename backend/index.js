import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are Meridian — an AI accountability agent.
You know everything about the user's project, their goals, deadlines, and progress.
You are direct, honest, and proactive. You never let the user ghost their own project.
When they drift or are inconsistent, you call it out firmly but supportively.`;

async function askGroq(userMessage, history = []) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage }
      ]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Groq API error: ${data.error.message}`);
  return data.choices[0].message.content;
}

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Meridian backend is running!" });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    const reply = await askGroq(message, history);
    res.json({
      reply,
      history: [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: reply }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily pulse endpoint
app.post("/pulse", async (req, res) => {
  try {
    const { projectName, lastActivity, goal } = req.body;
    const reply = await askGroq(
      `My project is "${projectName}". My goal is: ${goal}. My last activity was: ${lastActivity}. Generate my daily morning pulse — what I must focus on today. Be sharp and specific.`
    );
    res.json({ pulse: reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weekly retro endpoint
app.post("/retro", async (req, res) => {
  try {
    const { projectName, weekSummary, goal } = req.body;
    const reply = await askGroq(
      `My project is "${projectName}". My weekly goal was: ${goal}. Here is what I did this week: ${weekSummary}. Give me a brutally honest weekly retrospective.`
    );
    res.json({ retro: reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Waitlist endpoint
app.post("/waitlist", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.json({ error: "invalid email" });
    }
    console.log("New waitlist signup:", email);
    res.json({ message: "you're on the list. we'll reach out soon." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Meridian backend running on port ${process.env.PORT}`);
});