require("dotenv").config();
console.log("GEMINI=" + (process.env.GEMINI_API_KEY || "EMPTY").slice(0, 15));
console.log("OPENROUTER=" + (process.env.OPENROUTER_API_KEY || "EMPTY").slice(0, 15));
