# Zuno

Free, real-time chat for communities. Everything other apps charge for (banners, animated avatar decorations, name plates, GIF avatars) is free on Zuno.

## Features
- Sign up with email, display name, username and password; log in with email or username
- Everyone lands in the official **Zuno HQ** server, with a welcome DM from **Zuno Bot**
- Servers: create, upload icon and banner, invite links (`/invite/CODE`), Discover public servers, leave, delete
- Channels: text and announcement (admins only), topics, create, rename, delete
- Roles: owner, admin, member, bot; make admin, kick
- Live chat over WebSockets: typing indicators, online status, unread badges, desktop notifications
- Messages: replies, edit (or press Up), delete, pin, search, reactions, emoji picker, @mentions with autocomplete, @everyone
- Markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`, code blocks, > quotes, ||spoilers||, links
- GIFs: GIF picker (Tenor or GIPHY), paste any GIF link, upload GIFs; GIF links embed automatically
- Uploads: images, videos, audio, any file (25 MB), drag-and-drop or paste
- DMs and group DMs (up to 10), group name and icon, add people, leave
- Friends: requests, accept, decline, remove, block
- Profiles: avatar, banner (image or GIF), banner color, bio, pronouns, custom status, mutual servers
- Free Shop: 6 animated avatar decorations and 6 name plates
- No-code bots: name, avatar, trigger → reply commands, `{user}` and `{server}` placeholders, add to your servers; bot token for developers
- Built-in Zuno Bot: `!help !ping !roll !coin !8ball !joke !avatar !serverinfo !say !time`
- Dark and light themes, works on phones (installable as an app)

## Run it
```bash
npm install
npm start
# open http://localhost:3000
```

## Turn on GIF search (free)
Get a free key from https://developers.giphy.com or Google Tenor, then set one of:
```bash
GIPHY_API_KEY=your_key npm start
TENOR_API_KEY=your_key npm start
```
Without a key, users can still paste GIF links and upload GIFs.

## Host it free on Render
1. On render.com, choose **New → Blueprint** and pick this repo (it reads `render.yaml`).
2. Add `GIPHY_API_KEY` in the Environment tab if you want GIF search.

Note: Render's free plan has no permanent disk, so the database and uploads reset when the app restarts. For permanent data, add a disk (paid) and set `DATA_DIR` to it, or host on any VPS.

## Settings
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Web port |
| `DATA_DIR` | `./data` | Where the database and uploads live |
| `GIPHY_API_KEY` / `TENOR_API_KEY` | none | Turns on GIF search |
