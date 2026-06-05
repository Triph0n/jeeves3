<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f1fafaa5-f34e-489b-aa85-23ca4f05560d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Discord bot

1. Create a Discord application in the Discord Developer Portal.
2. Add a bot token to `.env` as `DISCORD_BOT_TOKEN`.
3. Enable Developer Mode in Discord, right-click the target thread, copy its channel ID, and set `DISCORD_THREAD_ID`.
4. In the bot settings, enable Message Content Intent.
5. Invite the bot with View Channels, Send Messages, Send Messages in Threads, and Read Message History permissions.
6. Start the bot:
   `npm run discord`
