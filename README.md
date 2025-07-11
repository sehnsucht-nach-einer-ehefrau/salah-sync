# Salah Sync

Salah Sync is a highly personalized daily scheduling application designed to align your life with Islamic prayer times, incorporating a rigorous, "testosterone-optimized" routine. It also features a "Downtime" mode for periods when the strict schedule cannot be followed, ensuring productivity is maintained through alternative activities.

## Core Features

- **Strict Mode**: A full-day schedule built around the five daily prayers. It includes slots for deep work, workouts (based on a weekly split), meals (with modes for bulking, maintenance, and cutting), and spiritual activities.
- **Downtime Mode**: A simplified, server-managed mode that alternates between 30-minute sessions of Quran reading and LeetCode practice.
- **Grip Strength Training**: In Downtime mode, a 1-minute grip strength training session is automatically initiated every 5 minutes, temporarily pausing the main activity.
- **Telegram Notifications**: Receive instant Telegram messages whenever a new activity begins in either mode.
- **Location-Based Prayer Times**: Automatically fetches prayer times from the Al Adhan API based on your browser's location.

## How It Works

The application is powered by a single, robust cron job that runs every minute to check for activity changes.

1.  **Unified Cron Job (`/api/cron`)**:
    - Fetches your saved `user_settings` from Vercel KV storage.
    - If in **Strict Mode**, it calculates the entire day's schedule based on the latest prayer times and your selected meal plan. It sends a notification if the current activity has changed since the last check.
    - If in **Downtime Mode**, it manages a state machine that cycles through Quran, LeetCode, and grip strength training, sending notifications for each transition.

2.  **Settings API (`/api/settings`)**:
    - `GET`: Retrieves your current settings.
    - `POST`: Updates your settings, allowing you to toggle between modes, change your meal plan, or enable/disable grip strength training in downtime.
    - `DELETE`: Clears all your settings from the server.

3.  **Frontend**:
    - The frontend syncs with the server every minute (aligned with the cron job) to display the current activity.
    - It allows you to set your initial location, which is required for the schedule calculation.
    - You can easily switch between modes and manage your preferences through the UI.

## Getting Started

1.  **Clone the repository.**
2.  **Install dependencies**: `pnpm install`
3.  **Set up environment variables**: Create a `.env.local` file with your Telegram bot token, chat ID, and a cron secret.
    ```
    TELEGRAM_BOT_TOKEN=your_bot_token
    TELEGRAM_CHAT_ID=your_chat_id
    CRON_SECRET=your_secret_cron_key
    ```
4.  **Run the development server**: `pnpm dev`
5.  **Set up the cron job**: Configure a service like Vercel Cron Jobs or GitHub Actions to send a `GET` request to the `/api/cron` endpoint every minute, including the `Authorization: Bearer ${CRON_SECRET}` header.
