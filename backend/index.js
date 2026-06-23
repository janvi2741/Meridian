import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(process.cwd(), "..", "frontend", "public")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  if (data.error) throw new Error(`Groq error: ${data.error.message}`);
  return data.choices[0].message.content;
}

app.post("/chat", async (req, res) => {
  try {
    const { message, userId = "default_user", projectId = null } = req.body;

    const { data: historyRows } = await supabase
      .from("chat_history")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    const history = historyRows || [];
    const reply = await askGroq(message, history);

    await supabase.from("chat_history").insert([
      { user_id: userId, project_id: projectId, role: "user", content: message },
      { user_id: userId, project_id: projectId, role: "assistant", content: reply }
    ]);

    res.json({
      reply,
      history: [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: reply }
      ]
    });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/pulse", async (req, res) => {
  try {
    const { projectName, lastActivity, goal, userId = "default_user" } = req.body;

    const reply = await askGroq(
      `My project is "${projectName}". My goal is: ${goal}. My last activity was: ${lastActivity}. Generate my daily morning pulse — what I must focus on today. Be sharp and specific.`
    );

    await supabase.from("pulse_log").insert([
      {
        user_id: userId,
        project_name: projectName,
        goal,
        pulse: reply
      }
    ]);

    res.json({ pulse: reply });
  } catch (err) {
    console.error("Pulse error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/project", async (req, res) => {
  try {
    const { userId = "default_user", name, goal, lastActivity } = req.body;

    const { data, error } = await supabase
      .from("projects")
      .upsert(
        { user_id: userId, name, goal, last_activity: lastActivity },
        { onConflict: "user_id" }
      )
      .select();

    if (error) throw new Error(error.message);
    res.json({ project: data[0] });
  } catch (err) {
    console.error("Project error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/project/:userId", async (req, res) => {
  try {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", req.params.userId)
      .maybeSingle();

    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/pulses/:userId", async (req, res) => {
  try {
    const { data } = await supabase
      .from("pulse_log")
      .select("*")
      .eq("user_id", req.params.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    res.json({ pulses: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/retro", async (req, res) => {
  try {
    const { projectName, weekSummary, goal, userId = "default_user" } = req.body;
    const reply = await askGroq(
      `My project is "${projectName}". My weekly goal was: ${goal}. Here is what I did this week: ${weekSummary}. Give me a brutally honest weekly retrospective. What did I do well? Where did I drift? What must I fix next week?`
    );

    await supabase.from("retro_log").insert([
      {
        user_id: userId,
        project_name: projectName,
        goal,
        week_summary: weekSummary,
        retro: reply
      }
    ]);

    res.json({ retro: reply });
  } catch (err) {
    console.error("Retro error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/waitlist", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const { error } = await supabase.from("waitlist_log").insert([{ email }]);

    if (error) {
      if (error.code === "23505") {
        return res.status(200).json({ message: "You're already on the list!" });
      }
      throw new Error(error.message);
    }

    res.json({ message: "You're on the waitlist! 🚀" });
  } catch (err) {
    console.error("Waitlist error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "..", "frontend", "public", "index.html"));
});

app.listen(process.env.PORT, () => {
  console.log(`Meridian backend running on port ${process.env.PORT}`);
});