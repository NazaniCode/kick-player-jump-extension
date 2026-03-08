(() => {
  "use strict";

  const SEEK_PATTERN = /seek|scrub|progress|timeline|slider|track|rail|bar/i;
  const HANDLE_STYLE_ID = "kick-vod-seek-fix-handle-style";
  const CUSTOM_HANDLE_CLASS = "kick-vod-seek-fix-handle";
  const CUSTOM_OVERLAY_CLASS = "kick-vod-seek-fix-overlay";
  const CUSTOM_OVERLAY_TRACK_CLASS = "kick-vod-seek-fix-overlay-track";
  const CUSTOM_OVERLAY_FILL_CLASS = "kick-vod-seek-fix-overlay-fill";
  const OVERLAY_HOST_ATTR = "data-kick-vod-seek-fix-overlay-host";
  const RESUME_PROMPT_OVERLAY_CLASS = "kick-vod-seek-fix-resume-overlay";
  const RESUME_PROMPT_PANEL_CLASS = "kick-vod-seek-fix-resume-panel";
  const RESUME_PROMPT_TITLE_CLASS = "kick-vod-seek-fix-resume-title";
  const RESUME_PROMPT_TEXT_CLASS = "kick-vod-seek-fix-resume-text";
  const RESUME_PROMPT_BUTTON_ROW_CLASS = "kick-vod-seek-fix-resume-actions";
  const RESUME_PROMPT_BUTTON_CLASS = "kick-vod-seek-fix-resume-button";
  const RESUME_PROMPT_PRIMARY_BUTTON_CLASS = "kick-vod-seek-fix-resume-button-primary";
  const RESUME_PROMPT_SECONDARY_BUTTON_CLASS = "kick-vod-seek-fix-resume-button-secondary";
  const HIDDEN_SLIDER_ATTR = "data-kick-vod-seek-fix-hidden";
  const HIDDEN_TIMELINE_ATTR = "data-kick-vod-seek-fix-hidden-timeline";
  const RANGE_SLIDER_ATTR = "data-kick-vod-seek-fix-range";
  const CUSTOM_HANDLE_WIDTH = 4;
  const CUSTOM_HANDLE_MIN_HEIGHT = 18;
  const CUSTOM_TRACK_HEIGHT = 4;
  const FALLBACK_HANDLE_OFFSET = 2;
  const RANGE_HANDLE_SHIFT = -8;
  const RESUME_STORAGE_KEY = "kickVodResumeEntries";
  const MAX_RESUME_ENTRIES = 50;
  const RESUME_SAVE_INTERVAL_MS = 10_000;
  const SESSION_CHECK_INTERVAL_MS = 1_000;
  const MIN_RESUME_PROMPT_SECONDS = 5;
  const LOCATION_CHANGE_EVENT = "kick-vod-seek-fix-locationchange";
  const EXCLUDED_SELECTOR = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[contenteditable='true']"
  ].join(",");

  let resumeEntriesCache = null;
  let resumeEntriesLoadPromise = null;
  let resumeStorageWriteQueue = Promise.resolve();
  let activeVodKey = null;
  let activeVideo = null;
  let activeSessionToken = 0;
  let activeSessionInitialized = false;
  let resumePromptState = null;
  let seekHandleUpdateQueued = false;

  function isKickVodPage() {
    return /\/videos\/[^/]+/.test(window.location.pathname);
  }

  function getCurrentVodKey() {
    if (!isKickVodPage()) {
      return null;
    }

    return window.location.pathname.replace(/\/+$/, "");
  }

  function getVisibleVideo() {
    const videos = [...document.querySelectorAll("video")];

    return videos
      .filter((video) => {
        const rect = video.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function ensureHandleStyle() {
    if (document.getElementById(HANDLE_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = HANDLE_STYLE_ID;
    style.textContent = `
      .${CUSTOM_HANDLE_CLASS} {
        position: absolute;
        top: 50%;
        width: ${CUSTOM_HANDLE_WIDTH}px;
        min-height: ${CUSTOM_HANDLE_MIN_HEIGHT}px;
        border-radius: 999px;
        background: #23c552;
        box-shadow: 0 0 0 1px rgba(35, 197, 82, 0.15);
        transform: translateY(-50%);
        pointer-events: none;
        z-index: 2147483646;
      }

      .${CUSTOM_OVERLAY_CLASS} {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 1;
      }

      .${CUSTOM_OVERLAY_TRACK_CLASS},
      .${CUSTOM_OVERLAY_FILL_CLASS} {
        position: absolute;
        top: 50%;
        height: ${CUSTOM_TRACK_HEIGHT}px;
        transform: translateY(-50%);
      }

      .${CUSTOM_OVERLAY_TRACK_CLASS} {
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.55);
      }

      .${CUSTOM_OVERLAY_FILL_CLASS} {
        left: 0;
        width: 0;
        background: #23c552;
      }

      [${HIDDEN_SLIDER_ATTR}] {
        opacity: 0 !important;
      }

      [${HIDDEN_TIMELINE_ATTR}] {
        opacity: 0 !important;
      }

      input[${RANGE_SLIDER_ATTR}] {
        -webkit-appearance: none;
        appearance: none;
      }

      input[${RANGE_SLIDER_ATTR}]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: ${CUSTOM_HANDLE_WIDTH}px;
        height: ${CUSTOM_HANDLE_MIN_HEIGHT}px;
        border: 0;
        border-radius: 2px;
        background: #23c552;
        box-shadow: 0 0 0 1px rgba(35, 197, 82, 0.15);
        transform: translateX(${RANGE_HANDLE_SHIFT}px);
      }

      input[${RANGE_SLIDER_ATTR}]::-moz-range-thumb {
        width: ${CUSTOM_HANDLE_WIDTH}px;
        height: ${CUSTOM_HANDLE_MIN_HEIGHT}px;
        border: 0;
        border-radius: 2px;
        background: #23c552;
        box-shadow: 0 0 0 1px rgba(35, 197, 82, 0.15);
        transform: translateX(${RANGE_HANDLE_SHIFT}px);
      }

      .${RESUME_PROMPT_OVERLAY_CLASS} {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        display: none;
        align-items: flex-end;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        pointer-events: none;
        z-index: 2147483647;
      }

      .${RESUME_PROMPT_PANEL_CLASS} {
        width: min(420px, 100%);
        padding: 18px 20px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        background: rgba(8, 12, 18, 0.9);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
        color: #f8fafc;
        pointer-events: auto;
      }

      .${RESUME_PROMPT_TITLE_CLASS} {
        margin: 0 0 6px;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.35;
      }

      .${RESUME_PROMPT_TEXT_CLASS} {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: rgba(248, 250, 252, 0.82);
      }

      .${RESUME_PROMPT_BUTTON_ROW_CLASS} {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }

      .${RESUME_PROMPT_BUTTON_CLASS} {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 120ms ease, opacity 120ms ease, background-color 120ms ease;
      }

      .${RESUME_PROMPT_BUTTON_CLASS}:hover {
        transform: translateY(-1px);
      }

      .${RESUME_PROMPT_PRIMARY_BUTTON_CLASS} {
        background: #23c552;
        color: #04130a;
      }

      .${RESUME_PROMPT_SECONDARY_BUTTON_CLASS} {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function getElementScore(element, videoRect) {
    if (!(element instanceof HTMLElement)) {
      return -1;
    }

    if (element.matches(EXCLUDED_SELECTOR)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height <= 0 || rect.height > 40) {
      return -1;
    }

    const insidePlayerX =
      rect.right >= videoRect.left - 12 && rect.left <= videoRect.right + 12;
    const nearPlayerBottom =
      rect.bottom >= videoRect.bottom - 120 && rect.top <= videoRect.bottom + 32;

    if (!insidePlayerX || !nearPlayerBottom) {
      return -1;
    }

    let score = 0;
    const role = element.getAttribute("role") || "";
    const className = typeof element.className === "string" ? element.className : "";
    const elementId = element.id || "";
    const ariaNow = element.getAttribute("aria-valuenow");
    const ariaMin = element.getAttribute("aria-valuemin");
    const ariaMax = element.getAttribute("aria-valuemax");

    if (role === "slider") {
      score += 8;
    }

    if (role === "progressbar") {
      score += 5;
    }

    if (ariaNow !== null && ariaMin !== null && ariaMax !== null) {
      score += 6;
    }

    if (SEEK_PATTERN.test(className) || SEEK_PATTERN.test(elementId)) {
      score += 4;
    }

    if (rect.width >= Math.max(160, videoRect.width * 0.2)) {
      score += 3;
    }

    if (rect.top >= videoRect.bottom - 64) {
      score += 2;
    }

    return score;
  }

  function collectCandidates(event, videoRect) {
    const candidates = new Set();
    const addCandidate = (node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      let current = node;
      for (let depth = 0; current && depth < 6; depth += 1) {
        candidates.add(current);
        current = current.parentElement;
      }
    };

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      addCandidate(node);
    }

    for (const node of document.elementsFromPoint(event.clientX, event.clientY)) {
      addCandidate(node);
    }

    return [...candidates];
  }

  function findSeekBar(event, video) {
    const videoRect = video.getBoundingClientRect();
    const candidates = collectCandidates(event, videoRect);

    let bestElement = null;
    let bestScore = -1;

    for (const element of candidates) {
      const score = getElementScore(element, videoRect);
      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
      }
    }

    return bestScore >= 4 ? bestElement : null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatTimecode(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function isStorageAvailable() {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
  }

  function getRuntimeErrorMessage(error) {
    if (!error) {
      return "";
    }

    if (typeof error === "string") {
      return error;
    }

    if (typeof error.message === "string") {
      return error.message;
    }

    return String(error);
  }

  function isContextInvalidatedError(error) {
    return /Extension context invalidated/i.test(getRuntimeErrorMessage(error));
  }

  function storageLocalGet(key) {
    if (!isStorageAvailable()) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => {
          if (chrome.runtime?.lastError) {
            if (!isContextInvalidatedError(chrome.runtime.lastError)) {
              console.warn("Kick VOD Seek Fix: failed to read resume entries.", chrome.runtime.lastError);
            }
            resolve({});
            return;
          }

          resolve(result || {});
        });
      } catch (error) {
        if (!isContextInvalidatedError(error)) {
          console.warn("Kick VOD Seek Fix: failed to read resume entries.", error);
        }
        resolve({});
      }
    });
  }

  function storageLocalSet(value) {
    if (!isStorageAvailable()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(value, () => {
          if (chrome.runtime?.lastError && !isContextInvalidatedError(chrome.runtime.lastError)) {
            console.warn("Kick VOD Seek Fix: failed to save resume entries.", chrome.runtime.lastError);
          }

          resolve();
        });
      } catch (error) {
        if (!isContextInvalidatedError(error)) {
          console.warn("Kick VOD Seek Fix: failed to save resume entries.", error);
        }
        resolve();
      }
    });
  }

  function normalizeResumeEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const uniqueEntries = new Map();

    for (const entry of [...entries].sort((left, right) => right.updatedAt - left.updatedAt)) {
      if (!entry || typeof entry.vodKey !== "string") {
        continue;
      }

      const resumeTime = Math.max(0, Math.floor(Number(entry.resumeTime) || 0));
      const updatedAt = Number(entry.updatedAt);
      if (!Number.isFinite(updatedAt)) {
        continue;
      }

      if (!uniqueEntries.has(entry.vodKey)) {
        uniqueEntries.set(entry.vodKey, {
          vodKey: entry.vodKey,
          resumeTime,
          updatedAt
        });
      }
    }

    return [...uniqueEntries.values()].slice(0, MAX_RESUME_ENTRIES);
  }

  async function getResumeEntries() {
    if (Array.isArray(resumeEntriesCache)) {
      return resumeEntriesCache;
    }

    if (!resumeEntriesLoadPromise) {
      resumeEntriesLoadPromise = storageLocalGet(RESUME_STORAGE_KEY).then((result) => {
        resumeEntriesCache = normalizeResumeEntries(result[RESUME_STORAGE_KEY]);
        return resumeEntriesCache;
      });
    }

    return resumeEntriesLoadPromise;
  }

  function updateResumeEntries(mutator) {
    resumeStorageWriteQueue = resumeStorageWriteQueue
      .then(async () => {
        const currentEntries = [...await getResumeEntries()];
        const nextEntries = normalizeResumeEntries(await mutator(currentEntries));
        resumeEntriesCache = nextEntries;
        await storageLocalSet({ [RESUME_STORAGE_KEY]: nextEntries });
        return nextEntries;
      })
      .catch((error) => {
        if (!isContextInvalidatedError(error)) {
          console.warn("Kick VOD Seek Fix: resume storage update failed.", error);
        }
        return resumeEntriesCache || [];
      });

    return resumeStorageWriteQueue;
  }

  async function getResumeEntry(vodKey) {
    const entries = await getResumeEntries();
    return entries.find((entry) => entry.vodKey === vodKey) || null;
  }

  function saveResumeEntry(vodKey, resumeTime) {
    const nextResumeTime = Math.max(0, Math.floor(resumeTime));
    const updatedAt = Date.now();

    return updateResumeEntries((entries) => [
      { vodKey, resumeTime: nextResumeTime, updatedAt },
      ...entries.filter((entry) => entry.vodKey !== vodKey)
    ]);
  }

  function removeResumeEntry(vodKey) {
    return updateResumeEntries((entries) => entries.filter((entry) => entry.vodKey !== vodKey));
  }

  function getSeekSlider(video) {
    const videoRect = video.getBoundingClientRect();
    const sliders = [
      ...document.querySelectorAll("[role='slider']"),
      ...document.querySelectorAll("input[type='range']")
    ];

    let bestSlider = null;
    let bestScore = -1;

    for (const slider of sliders) {
      if (!(slider instanceof HTMLElement)) {
        continue;
      }

      const rect = slider.getBoundingClientRect();
      if (rect.width < 80 || rect.height <= 0 || rect.height > 40) {
        continue;
      }

      const insidePlayerX =
        rect.right >= videoRect.left - 12 && rect.left <= videoRect.right + 12;
      const nearPlayerBottom =
        rect.bottom >= videoRect.bottom - 120 && rect.top <= videoRect.bottom + 32;

      if (!insidePlayerX || !nearPlayerBottom) {
        continue;
      }

      let score = getElementScore(slider, videoRect);
      if (slider instanceof HTMLInputElement && slider.type === "range") {
        score = Math.max(score, 14);
      }

      if (score > bestScore) {
        bestScore = score;
        bestSlider = slider;
      }
    }

    return bestScore >= 4 ? bestSlider : null;
  }

  function getSliderProgressPercent(slider, video) {
    const ariaNow = Number(slider.getAttribute("aria-valuenow"));
    const ariaMin = Number(slider.getAttribute("aria-valuemin"));
    const ariaMax = Number(slider.getAttribute("aria-valuemax"));

    if (
      Number.isFinite(ariaNow) &&
      Number.isFinite(ariaMin) &&
      Number.isFinite(ariaMax) &&
      ariaMax > ariaMin
    ) {
      return clamp((ariaNow - ariaMin) / (ariaMax - ariaMin), 0, 1);
    }

    if (Number.isFinite(video.duration) && video.duration > 0) {
      return clamp(video.currentTime / video.duration, 0, 1);
    }

    return 0;
  }

  function parseRgbColor(color) {
    const match = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
    if (!match) {
      return null;
    }

    return {
      red: Number(match[1]),
      green: Number(match[2]),
      blue: Number(match[3])
    };
  }

  function isGreenishColor(color) {
    const rgb = parseRgbColor(color);
    if (!rgb) {
      return false;
    }

    return rgb.green >= 120 && rgb.green - rgb.red >= 40 && rgb.green - rgb.blue >= 20;
  }

  function getNearbySliderNodes(slider) {
    const nodes = new Set();
    const roots = [slider, slider.parentElement, slider.parentElement?.parentElement];

    for (const root of roots) {
      if (!(root instanceof HTMLElement)) {
        continue;
      }

      nodes.add(root);
      for (const node of root.querySelectorAll("*")) {
        if (node instanceof HTMLElement) {
          nodes.add(node);
        }
      }
    }

    return [...nodes];
  }

  function getPlayerSearchRoot(video) {
    let current = video.parentElement;
    let bestRoot = video.parentElement;
    let depth = 0;
    const videoRect = video.getBoundingClientRect();

    while (current && depth < 6) {
      const rect = current.getBoundingClientRect();
      if (
        rect.width >= videoRect.width * 0.8 &&
        rect.height >= videoRect.height &&
        rect.height <= videoRect.height + 220
      ) {
        bestRoot = current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return bestRoot || document.body;
  }

  function scoreSliderTrackCandidate(element, sliderRect, videoRect) {
    if (!(element instanceof HTMLElement) || element.classList.contains(CUSTOM_OVERLAY_CLASS)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < Math.max(80, videoRect.width * 0.18) ||
      rect.height <= 0 ||
      rect.height > 14 ||
      rect.left < sliderRect.left - 12 ||
      rect.right > sliderRect.right + 12 ||
      rect.bottom < videoRect.bottom - 70 ||
      rect.top > videoRect.bottom + 18
    ) {
      return -1;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return -1;
    }

    let score = 0;
    const centerY = rect.top + rect.height / 2;
    const targetY = videoRect.bottom - 18;

    score += Math.max(0, 18 - Math.abs(centerY - targetY));
    score += rect.width / Math.max(1, sliderRect.width);
    score += Math.max(0, 14 - rect.height);

    if (element.getAttribute("role") === "progressbar" || element.getAttribute("role") === "slider") {
      score += 8;
    }

    if (isGreenishColor(style.backgroundColor) || isGreenishColor(style.borderColor)) {
      score += 4;
    }

    return score;
  }

  function getSliderTrackRect(slider, video) {
    if (!(slider instanceof HTMLElement)) {
      return null;
    }

    const sliderRect = slider.getBoundingClientRect();
    if (sliderRect.width <= 0 || sliderRect.height <= 0) {
      return null;
    }

    const videoRect = video.getBoundingClientRect();
    const candidates = getNearbySliderNodes(slider);

    let bestRect = null;
    let bestScore = -1;

    for (const node of candidates) {
      const score = scoreSliderTrackCandidate(node, sliderRect, videoRect);
      if (score > bestScore) {
        bestScore = score;
        bestRect = node.getBoundingClientRect();
      }
    }

    return bestScore >= 10 ? bestRect : null;
  }

  function scoreTimelineBandCandidate(element, videoRect) {
    if (!(element instanceof HTMLElement) || element.classList.contains(CUSTOM_OVERLAY_CLASS)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < videoRect.width * 0.35 ||
      rect.height <= 0 ||
      rect.height > 20 ||
      rect.left < videoRect.left - 24 ||
      rect.right > videoRect.right + 24 ||
      rect.bottom < videoRect.bottom - 80 ||
      rect.top > videoRect.bottom + 20
    ) {
      return -1;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return -1;
    }

    let score = 0;
    const centerY = rect.top + rect.height / 2;
    const targetY = videoRect.bottom - 18;

    score += Math.max(0, 18 - Math.abs(centerY - targetY));
    score += rect.width / Math.max(1, videoRect.width);

    if (element.getAttribute("role") === "slider" || element.getAttribute("role") === "progressbar") {
      score += 12;
    }

    if (element instanceof HTMLInputElement && element.type === "range") {
      score += 12;
    }

    if (isGreenishColor(style.backgroundColor)) {
      score += 3;
    }

    return score;
  }

  function getTimelineRect(video, slider) {
    const sliderTrackRect = slider instanceof HTMLElement ? getSliderTrackRect(slider, video) : null;
    if (sliderTrackRect) {
      return sliderTrackRect;
    }

    const videoRect = video.getBoundingClientRect();
    const searchRoot = getPlayerSearchRoot(video);
    const candidates = [searchRoot, ...searchRoot.querySelectorAll("*")];

    let bestRect = null;
    let bestScore = -1;

    for (const node of candidates) {
      const score = scoreTimelineBandCandidate(node, videoRect);
      if (score > bestScore) {
        bestScore = score;
        bestRect = node.getBoundingClientRect();
      }
    }

    if (bestScore >= 8) {
      return bestRect;
    }

    if (slider instanceof HTMLElement) {
      const rect = slider.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }

    return null;
  }

  function isTimelinePiece(element, timelineRect) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (
      element.classList.contains(CUSTOM_OVERLAY_CLASS) ||
      element.classList.contains(CUSTOM_OVERLAY_TRACK_CLASS) ||
      element.classList.contains(CUSTOM_OVERLAY_FILL_CLASS) ||
      element.classList.contains(CUSTOM_HANDLE_CLASS)
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.height > 28 ||
      rect.right < timelineRect.left - 12 ||
      rect.left > timelineRect.right + 12 ||
      rect.bottom < timelineRect.top - 14 ||
      rect.top > timelineRect.bottom + 14
    ) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return (
      element.getAttribute("role") === "slider" ||
      element.getAttribute("role") === "progressbar" ||
      (element instanceof HTMLInputElement && element.type === "range") ||
      rect.height <= 14 ||
      isGreenishColor(style.backgroundColor) ||
      isGreenishColor(style.borderColor) ||
      isGreenishColor(style.boxShadow)
    );
  }

  function hideNativeTimelinePieces(video, timelineRect) {
    const searchRoot = getPlayerSearchRoot(video);
    const candidates = [searchRoot, ...searchRoot.querySelectorAll("*")];

    for (const node of candidates) {
      if (isTimelinePiece(node, timelineRect)) {
        node.setAttribute(HIDDEN_TIMELINE_ATTR, "true");
      }
    }
  }

  function ensureOverlayHost(playerRoot) {
    if (!(playerRoot instanceof HTMLElement)) {
      return null;
    }

    playerRoot.setAttribute(OVERLAY_HOST_ATTR, "true");
    if (window.getComputedStyle(playerRoot).position === "static") {
      playerRoot.style.position = "relative";
    }

    return playerRoot;
  }

  function ensureOverlayParts(playerRoot) {
    const overlayHost = ensureOverlayHost(playerRoot);
    if (!(overlayHost instanceof HTMLElement)) {
      return null;
    }

    let overlay = document.querySelector(`.${CUSTOM_OVERLAY_CLASS}`);
    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement("div");
      overlay.className = CUSTOM_OVERLAY_CLASS;

      const track = document.createElement("div");
      track.className = CUSTOM_OVERLAY_TRACK_CLASS;

      const fill = document.createElement("div");
      fill.className = CUSTOM_OVERLAY_FILL_CLASS;

      const handle = document.createElement("div");
      handle.className = CUSTOM_HANDLE_CLASS;

      overlay.append(track, fill, handle);
      overlayHost.appendChild(overlay);
    } else if (overlay.parentElement !== overlayHost) {
      overlayHost.appendChild(overlay);
    }

    const track = overlay.querySelector(`.${CUSTOM_OVERLAY_TRACK_CLASS}`);
    const fill = overlay.querySelector(`.${CUSTOM_OVERLAY_FILL_CLASS}`);
    const handle = overlay.querySelector(`.${CUSTOM_HANDLE_CLASS}`);

    if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement) || !(handle instanceof HTMLElement)) {
      return null;
    }

    return { overlay, track, fill, handle };
  }

  function ensureResumePromptParts() {
    let overlay = document.querySelector(`.${RESUME_PROMPT_OVERLAY_CLASS}`);
    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement("div");
      overlay.className = RESUME_PROMPT_OVERLAY_CLASS;

      const panel = document.createElement("div");
      panel.className = RESUME_PROMPT_PANEL_CLASS;

      const title = document.createElement("h2");
      title.className = RESUME_PROMPT_TITLE_CLASS;

      const text = document.createElement("p");
      text.className = RESUME_PROMPT_TEXT_CLASS;

      const actions = document.createElement("div");
      actions.className = RESUME_PROMPT_BUTTON_ROW_CLASS;

      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = `${RESUME_PROMPT_BUTTON_CLASS} ${RESUME_PROMPT_PRIMARY_BUTTON_CLASS}`;

      const startButton = document.createElement("button");
      startButton.type = "button";
      startButton.className = `${RESUME_PROMPT_BUTTON_CLASS} ${RESUME_PROMPT_SECONDARY_BUTTON_CLASS}`;

      actions.append(continueButton, startButton);
      panel.append(title, text, actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    }

    const panel = overlay.querySelector(`.${RESUME_PROMPT_PANEL_CLASS}`);
    const title = overlay.querySelector(`.${RESUME_PROMPT_TITLE_CLASS}`);
    const text = overlay.querySelector(`.${RESUME_PROMPT_TEXT_CLASS}`);
    const buttons = overlay.querySelectorAll(`.${RESUME_PROMPT_BUTTON_CLASS}`);
    const continueButton = buttons[0];
    const startButton = buttons[1];

    if (
      !(panel instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(text instanceof HTMLElement) ||
      !(continueButton instanceof HTMLButtonElement) ||
      !(startButton instanceof HTMLButtonElement)
    ) {
      return null;
    }

    return { overlay, panel, title, text, continueButton, startButton };
  }

  function hideOverlay() {
    const overlay = document.querySelector(`.${CUSTOM_OVERLAY_CLASS}`);
    if (overlay instanceof HTMLElement) {
      overlay.style.display = "none";
    }
  }

  function hideResumePrompt() {
    resumePromptState = null;
    const promptParts = ensureResumePromptParts();
    if (!promptParts) {
      return;
    }

    promptParts.overlay.style.display = "none";
    promptParts.continueButton.onclick = null;
    promptParts.startButton.onclick = null;
  }

  function syncResumePromptPosition() {
    if (!resumePromptState) {
      return;
    }

    const promptParts = ensureResumePromptParts();
    if (!promptParts) {
      return;
    }

    const video = getVisibleVideo() || resumePromptState.video;
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) {
      hideResumePrompt();
      return;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hideResumePrompt();
      return;
    }

    promptParts.overlay.style.display = "flex";
    promptParts.overlay.style.left = `${rect.left}px`;
    promptParts.overlay.style.top = `${rect.top}px`;
    promptParts.overlay.style.width = `${rect.width}px`;
    promptParts.overlay.style.height = `${rect.height}px`;
  }

  function seekVideoToTime(video, targetTime) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    const applySeek = () => {
      const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
      const safeTime = hasDuration
        ? clamp(targetTime, 0, Math.max(0, video.duration))
        : Math.max(0, targetTime);

      if (typeof video.fastSeek === "function") {
        video.fastSeek(safeTime);
      } else {
        video.currentTime = safeTime;
      }

      scheduleSeekHandleAppearanceSync();
    };

    if (Number.isFinite(video.duration) && video.duration > 0) {
      applySeek();
      return;
    }

    video.addEventListener("loadedmetadata", applySeek, { once: true });
  }

  function showResumePrompt(vodKey, video, resumeTime, sessionToken) {
    ensureHandleStyle();

    const promptParts = ensureResumePromptParts();
    if (!promptParts) {
      return;
    }

    const formattedTime = formatTimecode(resumeTime);
    const wasPaused = video.paused;

    resumePromptState = {
      vodKey,
      video,
      resumeTime,
      sessionToken,
      wasPaused
    };

    promptParts.title.textContent = "Resume playback?";
    promptParts.text.textContent = `Continue this VOD from ${formattedTime} or start again from the beginning.`;
    promptParts.continueButton.textContent = `Continue from ${formattedTime}`;
    promptParts.startButton.textContent = "Start from beginning";

    if (!wasPaused) {
      video.pause();
    }

    promptParts.continueButton.onclick = () => {
      if (!resumePromptState || resumePromptState.sessionToken !== sessionToken || activeVodKey !== vodKey) {
        hideResumePrompt();
        return;
      }

      const targetVideo = getVisibleVideo() || resumePromptState.video;
      hideResumePrompt();

      if (targetVideo instanceof HTMLVideoElement) {
        activeVideo = targetVideo;
        seekVideoToTime(targetVideo, resumeTime);

        if (!wasPaused) {
          targetVideo.play().catch(() => {});
        }
      }

      void saveResumeEntry(vodKey, resumeTime);
    };

    promptParts.startButton.onclick = () => {
      if (!resumePromptState || resumePromptState.sessionToken !== sessionToken || activeVodKey !== vodKey) {
        hideResumePrompt();
        return;
      }

      const targetVideo = getVisibleVideo() || resumePromptState.video;
      hideResumePrompt();

      if (targetVideo instanceof HTMLVideoElement) {
        activeVideo = targetVideo;
        seekVideoToTime(targetVideo, 0);

        if (!wasPaused) {
          targetVideo.play().catch(() => {});
        }
      }

      void removeResumeEntry(vodKey);
    };

    syncResumePromptPosition();
  }

  function syncSeekHandleAppearance() {
    if (!isKickVodPage()) {
      hideOverlay();
      hideResumePrompt();
      return;
    }

    const video = getVisibleVideo();
    if (!video) {
      hideOverlay();
      syncResumePromptPosition();
      return;
    }

    const slider = getSeekSlider(video);
    const timelineRect = getTimelineRect(video, slider);
    if (!timelineRect) {
      hideOverlay();
      syncResumePromptPosition();
      return;
    }

    ensureHandleStyle();
    const playerRoot = getPlayerSearchRoot(video);

    const progressPercent = slider instanceof HTMLElement
      ? getSliderProgressPercent(slider, video)
      : clamp(video.currentTime / Math.max(video.duration || 1, 1), 0, 1);
    const overlayParts = ensureOverlayParts(playerRoot);
    if (!overlayParts) {
      syncResumePromptPosition();
      return;
    }

    if (slider instanceof HTMLElement) {
      slider.setAttribute(HIDDEN_SLIDER_ATTR, "true");
    }
    if (slider instanceof HTMLInputElement && slider.type === "range") {
      slider.setAttribute(RANGE_SLIDER_ATTR, "true");
    }

    hideNativeTimelinePieces(video, timelineRect);

    const handleLeft = clamp(
      timelineRect.width * progressPercent - FALLBACK_HANDLE_OFFSET,
      0,
      Math.max(0, timelineRect.width - CUSTOM_HANDLE_WIDTH)
    );
    const fillWidth = clamp(handleLeft, 0, timelineRect.width);
    const handleHeight = Math.max(CUSTOM_HANDLE_MIN_HEIGHT, timelineRect.height + 10);
    const playerRect = playerRoot.getBoundingClientRect();

    overlayParts.overlay.style.display = "block";
    overlayParts.overlay.style.left = `${timelineRect.left - playerRect.left}px`;
    overlayParts.overlay.style.top = `${timelineRect.top - playerRect.top}px`;
    overlayParts.overlay.style.width = `${timelineRect.width}px`;
    overlayParts.overlay.style.height = `${timelineRect.height}px`;
    overlayParts.fill.style.width = `${fillWidth}px`;
    overlayParts.handle.style.left = `${handleLeft}px`;
    overlayParts.handle.style.height = `${handleHeight}px`;

    syncResumePromptPosition();
  }

  function scheduleSeekHandleAppearanceSync() {
    if (seekHandleUpdateQueued) {
      return;
    }

    seekHandleUpdateQueued = true;
    window.requestAnimationFrame(() => {
      seekHandleUpdateQueued = false;
      syncSeekHandleAppearance();
    });
  }

  function isPointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function isDirectVideoClick(event, video) {
    if (!(video instanceof HTMLVideoElement)) {
      return false;
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(video);
  }

  function seekVideoFromClick(event) {
    if (!isKickVodPage()) {
      return;
    }

    if (event.button !== 0 || event.defaultPrevented) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || target.closest(EXCLUDED_SELECTOR)) {
      return;
    }

    const video = getVisibleVideo();
    if (!video) {
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const seekBar = findSeekBar(event, video);
    if (seekBar) {
      const rect = seekBar.getBoundingClientRect();
      if (rect.width <= 0 || !Number.isFinite(video.duration) || video.duration <= 0) {
        return;
      }

      const percent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const targetTime = percent * video.duration;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();

      seekVideoToTime(video, targetTime);

      // Some player UIs watch bubbling events around the timeline to refresh the scrubber.
      seekBar.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: rect.top + rect.height / 2,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true
        })
      );
      seekBar.dispatchEvent(new Event("input", { bubbles: true }));
      seekBar.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (
      !isPointInsideRect(event.clientX, event.clientY, videoRect) ||
      video.paused ||
      !isDirectVideoClick(event, video)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    video.pause();
  }

  async function persistActiveVodProgress() {
    if (!activeVodKey || !(activeVideo instanceof HTMLVideoElement)) {
      return;
    }

    if (resumePromptState && resumePromptState.vodKey === activeVodKey) {
      return;
    }

    const currentTime = Math.max(0, Math.floor(activeVideo.currentTime || 0));
    await saveResumeEntry(activeVodKey, currentTime);
  }

  function resetActiveSession(nextVodKey) {
    activeVodKey = nextVodKey;
    activeVideo = null;
    activeSessionInitialized = false;
    activeSessionToken += 1;
    hideResumePrompt();
  }

  async function ensureActiveVodSession() {
    const currentVodKey = getCurrentVodKey();
    if (currentVodKey !== activeVodKey) {
      void persistActiveVodProgress();
      resetActiveSession(currentVodKey);
    }

    if (!currentVodKey) {
      return;
    }

    const video = getVisibleVideo();
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    activeVideo = video;

    if (activeSessionInitialized) {
      return;
    }

    activeSessionInitialized = true;
    const sessionToken = activeSessionToken;
    const existingEntry = await getResumeEntry(currentVodKey);

    if (sessionToken !== activeSessionToken || currentVodKey !== activeVodKey) {
      return;
    }

    if (existingEntry && existingEntry.resumeTime >= MIN_RESUME_PROMPT_SECONDS) {
      showResumePrompt(currentVodKey, video, existingEntry.resumeTime, sessionToken);
      return;
    }

    void saveResumeEntry(currentVodKey, Math.max(0, Math.floor(video.currentTime || 0)));
  }

  function emitLocationChange() {
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  }

  function installLocationChangeListeners() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      emitLocationChange();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      emitLocationChange();
      return result;
    };

    window.addEventListener("popstate", emitLocationChange);
  }

  const observer = new MutationObserver(() => {
    scheduleSeekHandleAppearanceSync();
    void ensureActiveVodSession();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-valuenow", "aria-valuemin", "aria-valuemax", "style", "class"]
  });

  installLocationChangeListeners();

  document.addEventListener("click", seekVideoFromClick, true);
  document.addEventListener("pointermove", scheduleSeekHandleAppearanceSync, true);
  document.addEventListener("timeupdate", scheduleSeekHandleAppearanceSync, true);
  window.addEventListener("resize", scheduleSeekHandleAppearanceSync, { passive: true });
  window.addEventListener("load", () => {
    scheduleSeekHandleAppearanceSync();
    void ensureActiveVodSession();
  }, { once: true });
  window.addEventListener(LOCATION_CHANGE_EVENT, () => {
    void persistActiveVodProgress();
    resetActiveSession(getCurrentVodKey());
    scheduleSeekHandleAppearanceSync();
    void ensureActiveVodSession();
  });
  window.addEventListener("pagehide", () => {
    void persistActiveVodProgress();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      void persistActiveVodProgress();
    }
  });

  window.setInterval(() => {
    void ensureActiveVodSession();
  }, SESSION_CHECK_INTERVAL_MS);

  window.setInterval(() => {
    void persistActiveVodProgress();
  }, RESUME_SAVE_INTERVAL_MS);

  scheduleSeekHandleAppearanceSync();
  void ensureActiveVodSession();
})();
