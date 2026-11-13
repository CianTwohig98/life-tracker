# Life Tracker: from zero to your Android phone, with hands-off updates

You end up with
- a public portfolio-ready GitHub repository with the app (code only, never your data),
- the app on your phone as an icon, working offline,
- the same data on phone and laptop, with a cloud backup,
- new versions that Claude pushes for you and that reach your phone by themselves.

Cost: 0 EUR. Time: about 30 minutes, once. Do parts 1 to 4 on the laptop, part 5 on the phone.

Why your data is safe from updates: the app (code) lives on GitHub, your data lives in Supabase and on each device. They never mix, so a new version cannot overwrite your data.

---

## Part 1. Your GitHub account (this will be your portfolio, 8 minutes)
1. github.com, Sign up. Pick the username with care, it appears on your CV and in every project link. Good: firstname-lastname. Avoid numbers and jokes.
2. Turn on two-factor authentication: Settings, Password and authentication, Two-factor. It controls what is published under your name.
3. Hide your email: Settings, Emails. Tick "Keep my email addresses private" and "Block command line pushes that expose my email". Commits then show a GitHub no-reply address.
4. Profile: Settings, Public profile. Real name, a clear photo, a one-line bio (for example "Operations Research and data. I build small tools."), country as location, and a link (LinkedIn or later your portfolio).
5. Later (optional, 5 minutes): create a repository named exactly like your username, tick "Add a README". Whatever you write there is shown at the top of your profile. Use it for a short intro and a list of your projects.

## Part 2. Create the empty repository (2 minutes)
1. Top right "+", New repository.
2. Name: life-tracker. Description: "Gamified life tracker: needs bars, skill XP, quests, to-dos and a daily plan. Offline-first PWA with cloud sync."
3. Public. Do NOT tick README, .gitignore or license (leave it empty, I add those). Create repository.
The code is public. Your personal data and settings are not in it.

## Part 3. Let Claude push to it (the hands-off part, 5 minutes)
1. claude.ai, Settings, Connectors (called Integrations in some versions), GitHub, Connect.
2. GitHub asks to install the Claude app. Choose "Only select repositories" and pick life-tracker. This gives access to this one repository only.
3. Tell me in the chat: "repo ready: YOURUSERNAME/life-tracker". I then attach the repository, push everything (source, tests, built site, README with screenshots) and tell you when it is done.
   If the connection does not work I tell you right away and we use the fallback: unzip the repo zip and drag its contents (including the folders) into the repository page, "uploading an existing file", then Commit. You then upload new versions the same way, only the `docs` folder changes.
4. Turn on hosting: in the repository Settings, Pages. Source: "Deploy from a branch". Branch: main, folder: /docs. Save. After one or two minutes the page shows your address:
   https://YOURUSERNAME.github.io/life-tracker/
5. Make the repository look good: on the repository front page click the gear next to About. Website: your address above. Topics: pwa, habit-tracker, gamification, javascript, supabase. Then on your profile, Customize your pins, tick life-tracker.

## Part 4. Cloud storage and sync (Supabase, 8 minutes)
1. supabase.com, sign in (GitHub login works).
2. New project. Name: life-tracker. Choose and save a database password. Region: West EU or Central EU. Create, wait about 2 minutes.
3. SQL Editor, New query. Paste the whole file `supabase/schema.sql` (also attached), Run. Expected: "Success".
4. Authentication, Sign In / Providers, Email. Switch OFF "Confirm email". Save.
5. Project Settings, API (or API Keys). Copy the Project URL (https://xxxx.supabase.co) and the anon / public key (called publishable key in newer dashboards). Save them in a note on your phone. These two are public by design; your login protects the data.

## Part 5. Move your data and install on Android (10 minutes)
Move your existing data first, because the old file and the new web address keep separate storage.
1. On the laptop, in the version you have been using: Settings, Your data, "Download file". You get a backup .json file.
2. Laptop, open your new address (https://YOURUSERNAME.github.io/life-tracker/). Settings, Your data, Import backup, pick the file.
3. Same page, Sync across devices: paste the Project URL and anon key, enter your email and a password, press "Create account". The badge at the top turns to "synced". Your data is now in the cloud.
4. Phone: open Chrome (not an in-app browser), go to your address. Chrome menu (three dots), "Install app" (or "Add to Home screen", then Install). Open the app from the new icon.
5. In the app: More, Settings, Sync across devices. Paste the URL and key, same email and password, press "Sign in" (not Create). Your data appears.
Optional safety: Settings, Back up now opens the share menu so you can send the file to Google Drive.

## How updates work from now on
1. You tell me what to change.
2. I change it, run all tests, and push to the repository.
3. GitHub rebuilds the page, about 1 to 2 minutes.
4. On the phone, close the app and open it again while online. Settings, Your data shows the app version (date and time) so you can see you have the new one. If it still shows the old one, close and reopen once more.
Before the app changes an older data format it keeps a copy on the device, and sync keeps your cloud copy as well.

## Good to know and troubleshooting
- Everything works offline. Changes sync when you are back online; the badge shows the state.
- Supabase free projects pause after 7 days without any activity. Opening the app counts. If it pauses, press Restore in the Supabase dashboard; nothing is lost.
- Pages shows 404: check Settings, Pages says main and /docs, then wait two minutes.
- "User already registered": use Sign in, not Create account.
- No "Install app" in Chrome: open the address in Chrome itself, reload once, then try the menu again.
- Never put personal details in the repository, in issues or in commit messages. The app code is public on purpose.
- Keep `sync-config.json` out of the repository (it is already ignored). It is optional anyway; you can always type the URL and key in the app.
