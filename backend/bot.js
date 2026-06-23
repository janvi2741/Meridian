import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Supabase client — using service role key so bot bypasses RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are Meridian — an AI accountability agent.
You are direct, honest, and proactive. You never let the user ghost their own project.
Keep responses concise for Telegram — max 3-4 short paragraphs.`;

// Tracks users who just ran /retro and are expected to send their week summary next
const awaitingRetro = new Set();

async function askGroq(userMessage) {
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
        { role: "user", content: userMessage }
      ]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Groq error: ${data.error.message}`);
  return data.choices[0].message.content;
}

bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const name = ctx.from.first_name;

  try {
    // Check if a project already exists for this user before touching anything
    const { data: existing, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch error (start):", fetchError.message);
    }

    // Only create the default row if this user has never had one — never overwrite real data
    if (!existing) {
      const { error: insertError } = await supabase.from("projects").upsert(
        { user_id: userId, name: "My Project", goal: "Not set yet", last_activity: "Just joined" },
        { onConflict: "user_id" }
      );
      if (insertError) console.error("Upsert error (start):", insertError.message);
    }

    await ctx.reply(`⚡ Welcome to Meridian, ${name}!\n\nI'm your AI accountability agent. I'll keep you on track with your projects.\n\nCommands:\n/setproject - Set your project name & goal\n/pulse - Get your daily focus briefing\n/retro - Weekly retrospective\n/chat - Talk to me about anything\n/status - See your current project`);
  } catch (err) {
    console.error("Unhandled error (start):", err.message);
    await ctx.reply("⚠️ Something went wrong starting up. Check the bot terminal for details.");
  }
});

bot.command("setproject", (ctx) => {
  awaitingRetro.delete(ctx.from.id.toString());
  ctx.reply("Send me your project details in this format:\n\nProject: [name]\nGoal: [your goal]\nWorking on: [what you did last]");
});

bot.command("pulse", async (ctx) => {
  const userId = ctx.from.id.toString();
  ctx.reply("⚡ Generating your daily pulse...");

  try {
    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) console.error("Fetch error (pulse):", fetchError.message);

    if (!project || !project.goal || project.goal === "Not set yet") {
      await ctx.reply("You haven't set your project yet! Use /setproject first.\n\nSend your details like:\nProject: Meridian\nGoal: Launch in 8 weeks\nWorking on: Built the bot");
      return;
    }

    const pulse = await askGroq(
      `My project is "${project.name}". My goal is: ${project.goal}. My last activity was: ${project.last_activity}. Generate my daily morning pulse — what I must focus on today. Be sharp, specific, and concise for a Telegram message.`
    );

    const { error: insertError } = await supabase.from("pulse_log").insert([{
      user_id: userId,
      project_name: project.name,
      goal: project.goal,
      pulse
    }]);
    if (insertError) console.error("Insert error (pulse_log):", insertError.message);

    await ctx.reply(`🌅 Daily Pulse\n\n${pulse}`);
  } catch (err) {
    console.error("Unhandled error (pulse):", err.message);
    await ctx.reply("⚠️ Something went wrong generating your pulse. Check the bot terminal for details.");
  }
});

bot.command("status", async (ctx) => {
  const userId = ctx.from.id.toString();

  try {
    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) console.error("Fetch error (status):", error.message);

    if (!project) {
      await ctx.reply("No project set. Use /setproject to get started.");
      return;
    }

    await ctx.reply(`📋 Your Project\n\nName: ${project.name}\nGoal: ${project.goal}\nLast activity: ${project.last_activity}`);
  } catch (err) {
    console.error("Unhandled error (status):", err.message);
    await ctx.reply("⚠️ Something went wrong fetching your status. Check the bot terminal for details.");
  }
});

bot.command("retro", async (ctx) => {
  const userId = ctx.from.id.toString();

  try {
    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) console.error("Fetch error (retro):", error.message);

    if (!project || !project.goal || project.goal === "Not set yet") {
      await ctx.reply("You haven't set your project yet! Use /setproject first.");
      return;
    }

    awaitingRetro.add(userId);
    await ctx.reply("📊 Tell me what you did this week — just type it out as one message — and I'll give you an honest retrospective.");
  } catch (err) {
    console.error("Unhandled error (retro):", err.message);
    await ctx.reply("⚠️ Something went wrong starting your retro. Check the bot terminal for details.");
  }
});

bot.command("chat", (ctx) => {
  awaitingRetro.delete(ctx.from.id.toString());
  ctx.reply("💬 I'm listening. What's on your mind about your project?");
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;

  try {
    // 1. If we're waiting on a weekly summary for /retro, this message is it
    if (awaitingRetro.has(userId)) {
      awaitingRetro.delete(userId);

      const { data: project, error: fetchError } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) console.error("Fetch error (retro text):", fetchError.message);

      if (!project) {
        await ctx.reply("Couldn't find your project — use /setproject first, then /retro again.");
        return;
      }

      await ctx.reply("📊 Generating your retrospective...");

      const retro = await askGroq(
        `My project is "${project.name}". My weekly goal was: ${project.goal}. Here is what I did this week: ${text}. Give me a brutally honest weekly retrospective. What did I do well? Where did I drift? What must I fix next week? Keep it concise for Telegram.`
      );

      const { error: insertError } = await supabase.from("retro_log").insert([{
        user_id: userId,
        project_name: project.name,
        goal: project.goal,
        week_summary: text,
        retro
      }]);
      if (insertError) console.error("Insert error (retro_log):", insertError.message);

      await ctx.reply(`🪞 Weekly Retro\n\n${retro}`);
      return;
    }

    // 2. Project setup format
    if (text.toLowerCase().includes("project:") && text.toLowerCase().includes("goal:")) {
      const lines = text.split("\n");
      const nameLine = lines.find(l => l.toLowerCase().startsWith("project:"));
      const goalLine = lines.find(l => l.toLowerCase().startsWith("goal:"));
      const activityLine = lines.find(l => l.toLowerCase().startsWith("working on:"));

      const name = nameLine ? nameLine.split(":").slice(1).join(":").trim() : "My Project";
      const goal = goalLine ? goalLine.split(":").slice(1).join(":").trim() : "Not set yet";
      const lastActivity = activityLine ? activityLine.split(":").slice(1).join(":").trim() : "Just started";

      const { error } = await supabase.from("projects").upsert(
        { user_id: userId, name, goal, last_activity: lastActivity },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("Upsert error (setproject):", error.message);
        await ctx.reply("⚠️ Something went wrong saving your project. Check the bot terminal for the error.");
        return;
      }

      await ctx.reply(`✅ Project saved!\n\nName: ${name}\nGoal: ${goal}\n\nUse /pulse to get your first daily briefing!`);
      return;
    }

    // 3. Otherwise — free chat
    const reply = await askGroq(text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Unhandled error (text handler):", err.message);
    await ctx.reply("⚠️ Something went wrong processing that. Check the bot terminal for details.");
  }
});

// Catch anything that slips through Telegraf's own handler wrapping
bot.catch((err, ctx) => {
  console.error(`Unhandled bot error for update ${ctx.update.update_id}:`, err.message);
});

bot.launch();
console.log("🤖 Meridian Telegram bot is running!");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));