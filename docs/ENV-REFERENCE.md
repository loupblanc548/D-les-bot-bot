# Environment Variables Reference

Copy this file to `.env` and fill in your values.
All variables are optional unless marked **required**.

## Discord (required)
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
OWNER_ID=your_discord_user_id
```

## AI Providers
```
# OpenRouter (required — primary AI provider)
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=deepseek/deepseek-v3:free

# NVIDIA NIM (optional — free fallback, get key at https://build.nvidia.com/settings/api-keys)
NVIDIA_API_KEY=your_nvidia_api_key

# Gemini (optional — free fallback)
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash

# OpenAI (optional — premium tier)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini

# Groq (optional — free tier)
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
```

## Control Server
```
# Authentication token for the control server API
CONTROL_TOKEN=your_secure_random_token

# CORS origins (comma-separated, no spaces)
# In production, set to your dashboard URL (e.g. https://dashboard.example.com)
# In development, defaults to * (all origins)
CONTROL_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Port for the control server (default: 7070)
CONTROL_SERVER_PORT=7070
```

## AI System Prompt
```
AI_SYSTEM_PROMPT=Tu es un assistant utile et concis. Reponds en francais.
```

## Fallback Priority Order
1. **Local LLM (Ollama on VPS)** — highest priority, free, no quota
2. **Gemini** — free, separate quota
3. **NVIDIA NIM** — free, powerful models (Llama Nemotron, DeepSeek, GPT-OSS)
4. **OpenRouter** — last resort, paid API
