# Semester Week Planner

Your week of classes, work shifts and tasks. Upload a screenshot of a timetable or roster, or type a change ("my Friday shift is 16:00–23:00 this week"), and Claude updates the schedule. You approve every change before it's saved. Works on phone and computer, and can be installed on your phone's home screen.

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | The app itself |
| `public/manifest.webmanifest`, `public/*.png` | Lets you add the app to your phone's home screen |
| `api/plan.js` | Sends your request and screenshots to Claude |
| `api/schedule.js` | Saves your schedule so phone and computer stay in sync |
| `planner-backup.json` | Your current schedule (classes, exam, Friday shift). Not uploaded to the website. |

## What you need

1. A free **Vercel** account: https://vercel.com/signup
2. A free **GitHub** account: https://github.com/signup (easiest way to get the files to Vercel)
3. An **Anthropic API key** for the AI: https://console.anthropic.com → API Keys → Create Key. This is separate from your Claude subscription and is billed per use; reading a screenshot costs roughly a cent or two.

## Deploy (no terminal needed)

### 1. Put the files on GitHub
1. Unzip this folder on your computer.
2. On GitHub, click **+** (top right) → **New repository**. Name it `week-planner`, choose **Private**, click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Drag in everything from inside the unzipped folder: the `api` and `public` folders, `package.json`, `vercel.json` and `README.md`. You can leave out `planner-backup.json`.
5. Click **Commit changes**.

### 2. Import it into Vercel
1. Go to https://vercel.com/new and choose **Continue with GitHub**.
2. Find `week-planner` and click **Import**.
3. Leave **Framework Preset** as **Other**. Don't change the build settings.
4. Open **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | A password you choose. You type it once on each device. |
   | `ANTHROPIC_API_KEY` | Your key from console.anthropic.com (starts with `sk-ant-`) |

5. Click **Deploy**. After about a minute you get a link like `week-planner-xyz.vercel.app`.

### 3. Turn on syncing between phone and computer
Without this step the app still works, but each device keeps its own copy.

1. In your Vercel project, open the **Storage** tab.
2. Choose **Upstash for Redis** (free plan) → **Create**, and connect it to the `week-planner` project.
3. Go to **Deployments**, click **⋯** on the latest one → **Redeploy**.

### 4. Bring in your current schedule
1. Open your new link and enter your `APP_PASSWORD`.
2. In **Put it on your phone**, click **Restore backup** and choose `planner-backup.json`.

### 5. Put it on your phone
Open the link on your phone and enter the password once.
- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ → **Add to Home screen**

## Making changes later
Edit a file on GitHub and commit; Vercel redeploys automatically. After changing an environment variable in Vercel, redeploy so it takes effect.

## Optional settings
- `ANTHROPIC_MODEL`: which Claude model to use. Default `claude-sonnet-5-5`. For lower cost try `claude-haiku-5-5`.

## If something doesn't work
The app shows a message saying what's wrong:
- **"The AI isn't set up yet"**: add `ANTHROPIC_API_KEY` in Vercel, then redeploy.
- **"Your Anthropic API key was rejected"**: check the key, and that your Anthropic account has credit.
- **"Saved on this device only"**: storage isn't connected yet (step 3).
- **"Wrong password"**: it must match `APP_PASSWORD` exactly.
