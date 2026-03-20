# Kick VOD Fix

A small Chrome extension that fixes unreliable click-to-seek behavior on Kick VODs, restores click-to-pause inside the player, remembers where you left off in VODs, and replaces the round seek dot with a vertical green line.

When Kick ignores a click near the current seek handle, this extension intercepts the click on the VOD progress bar and seeks the underlying video directly to the clicked timestamp. It also lets a direct click inside a playing VOD pause playback, redraws the timeline overlay so the current position uses a slim vertical line instead of the default circular handle, and stores resume points for up to 50 recently watched VODs.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `\kick-player-jump-extension`

## What it does

- Runs only on `https://kick.com/*`
- Activates only on VOD URLs such as `/channel/videos/<id>`
- Detects clicks on the player timeline
- Forces the video to seek to the clicked position, even when Kick's default click handling ignores the click
- Lets clicking inside a playing VOD pause playback
- Saves your VOD position roughly every 10 seconds
- Shows an in-player popup for previously watched VODs so you can continue from the saved time or start over
- Keeps at most 50 unique VOD resume entries and drops the oldest one when the list is full
- Replaces the round green seek marker with a custom vertical green line overlay
- Keeps the custom seek line aligned with the current playback position

## Files

- `manifest.json`: Chrome extension manifest
- `content.js`: Kick VOD seek, pause, resume tracking, and custom timeline overlay logic
