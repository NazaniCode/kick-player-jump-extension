# Kick VOD Seek Fix

A small Chrome extension that fixes unreliable click-to-seek behavior on Kick VODs and restores click-to-pause inside the player.

When Kick ignores a click near the current seek handle, this extension intercepts the click on the VOD progress bar and seeks the underlying video directly to the clicked timestamp. It also lets a direct click inside the VOD pause playback when it is currently playing.

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

## Files

- `manifest.json`: Chrome extension manifest
- `content.js`: Kick VOD seek fix logic
