# Kick VOD Seek Fix

A small Chrome extension that fixes unreliable click-to-seek behavior on Kick VODs, restores click-to-pause inside the player, and replaces the round seek dot with a vertical green line.

When Kick ignores a click near the current seek handle, this extension intercepts the click on the VOD progress bar and seeks the underlying video directly to the clicked timestamp. It also lets a direct click inside a playing VOD pause playback and redraws the timeline overlay so the current position uses a slim vertical line instead of the default circular handle.

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
- Replaces the round green seek marker with a custom vertical green line overlay
- Keeps the custom seek line aligned with the current playback position

## Files

- `manifest.json`: Chrome extension manifest
- `content.js`: Kick VOD seek, pause, and custom timeline overlay logic
