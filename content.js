(() => {
  "use strict";

  const SEEK_PATTERN = /seek|scrub|progress|timeline|slider|track|rail|bar/i;
  const HANDLE_STYLE_ID = "kick-vod-seek-fix-handle-style";
  const CUSTOM_HANDLE_CLASS = "kick-vod-seek-fix-handle";
  const CUSTOM_OVERLAY_CLASS = "kick-vod-seek-fix-overlay";
  const CUSTOM_OVERLAY_TRACK_CLASS = "kick-vod-seek-fix-overlay-track";
  const CUSTOM_OVERLAY_FILL_CLASS = "kick-vod-seek-fix-overlay-fill";
  const HIDDEN_HANDLE_CLASS = "kick-vod-seek-fix-hidden-handle";
  const HIDDEN_SLIDER_ATTR = "data-kick-vod-seek-fix-hidden";
  const HIDDEN_TIMELINE_ATTR = "data-kick-vod-seek-fix-hidden-timeline";
  const RANGE_SLIDER_ATTR = "data-kick-vod-seek-fix-range";
  const CUSTOM_HANDLE_WIDTH = 4;
  const CUSTOM_HANDLE_MIN_HEIGHT = 18;
  const CUSTOM_TRACK_HEIGHT = 4;
  const FALLBACK_HANDLE_OFFSET = 2;
  const RANGE_HANDLE_SHIFT = -8;
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

  function isKickVodPage() {
    return /\/videos\/[^/]+/.test(window.location.pathname);
  }

  function getVisibleVideo() {
    const videos = [...document.querySelectorAll("video")];

    return videos
      .filter((video) => {
        const rect = video.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          Number.isFinite(video.duration) &&
          video.duration > 0
        );
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
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483646;
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

      .${HIDDEN_HANDLE_CLASS} {
        opacity: 0 !important;
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
    if (slider instanceof HTMLElement) {
      const rect = slider.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
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

    return bestScore >= 8 ? bestRect : null;
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

  function scoreProgressFillCandidate(element, sliderRect, expectedCenterX) {
    if (!(element instanceof HTMLElement) || element.classList.contains(CUSTOM_HANDLE_CLASS)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.width > sliderRect.width + 24 ||
      rect.height <= 0 ||
      rect.height > 18 ||
      rect.left < sliderRect.left - 24 ||
      rect.left > sliderRect.left + 24 ||
      rect.bottom < sliderRect.top - 12 ||
      rect.top > sliderRect.bottom + 12 ||
      rect.right < sliderRect.left ||
      rect.right > sliderRect.right + 24
    ) {
      return -1;
    }

    const style = window.getComputedStyle(element);
    if (!isGreenishColor(style.backgroundColor)) {
      return -1;
    }

    let score = 0;
    const centerY = rect.top + rect.height / 2;
    const sliderCenterY = sliderRect.top + sliderRect.height / 2;

    score += Math.max(0, 12 - Math.abs(centerY - sliderCenterY) * 2);
    score += Math.max(0, 18 - Math.abs(rect.right - expectedCenterX) / 6);
    score += Math.min(rect.width, sliderRect.width * 0.75) / 12;

    if (style.borderRadius !== "0px") {
      score += 2;
    }

    return score;
  }

  function scoreGreenCapCandidate(element, sliderRect, expectedCenterX) {
    if (!(element instanceof HTMLElement) || element.classList.contains(CUSTOM_HANDLE_CLASS)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < 6 ||
      rect.height < 6 ||
      rect.width > 28 ||
      rect.height > 28 ||
      rect.right < sliderRect.left - 18 ||
      rect.left > sliderRect.right + 18 ||
      rect.bottom < sliderRect.top - 20 ||
      rect.top > sliderRect.bottom + 20
    ) {
      return -1;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return -1;
    }

    const isGreen =
      isGreenishColor(style.backgroundColor) ||
      isGreenishColor(style.borderColor) ||
      isGreenishColor(style.boxShadow);

    if (!isGreen) {
      return -1;
    }

    let score = 0;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const sliderCenterY = sliderRect.top + sliderRect.height / 2;
    const borderRadiusValue = parseFloat(style.borderRadius);

    if (Math.abs(rect.width - rect.height) <= 8) {
      score += 5;
    }

    if (
      style.borderRadius.includes("%") ||
      borderRadiusValue >= Math.min(rect.width, rect.height) / 2 - 1
    ) {
      score += 6;
    }

    score += Math.max(0, 10 - Math.abs(centerY - sliderCenterY));
    score += Math.max(0, 16 - Math.abs(centerX - expectedCenterX) / 3);

    return score;
  }

  function findProgressFill(slider, progressPercent) {
    const sliderRect = slider.getBoundingClientRect();
    const expectedCenterX = sliderRect.left + sliderRect.width * progressPercent;
    const candidates = getNearbySliderNodes(slider);

    let bestFill = null;
    let bestScore = -1;

    for (const node of candidates) {
      const score = scoreProgressFillCandidate(node, sliderRect, expectedCenterX);
      if (score > bestScore) {
        bestScore = score;
        bestFill = node;
      }
    }

    return bestScore >= 12 ? bestFill : null;
  }

  function findGreenCap(slider, progressPercent) {
    const sliderRect = slider.getBoundingClientRect();
    const expectedCenterX = sliderRect.left + sliderRect.width * progressPercent;
    const candidates = getNearbySliderNodes(slider);

    let bestCap = null;
    let bestScore = -1;

    for (const node of candidates) {
      const score = scoreGreenCapCandidate(node, sliderRect, expectedCenterX);
      if (score > bestScore) {
        bestScore = score;
        bestCap = node;
      }
    }

    return bestScore >= 13 ? bestCap : null;
  }

  function scoreHandleCandidate(element, sliderRect, expectedCenterX) {
    if (!(element instanceof HTMLElement) || element.classList.contains(CUSTOM_HANDLE_CLASS)) {
      return -1;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < 8 ||
      rect.height < 8 ||
      rect.width > 32 ||
      rect.height > 32 ||
      rect.right < sliderRect.left - 24 ||
      rect.left > sliderRect.right + 24 ||
      rect.bottom < sliderRect.top - 24 ||
      rect.top > sliderRect.bottom + 24
    ) {
      return -1;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return -1;
    }

    let score = 0;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const sliderCenterY = sliderRect.top + sliderRect.height / 2;
    const borderRadiusValue = parseFloat(style.borderRadius);

    if (Math.abs(rect.width - rect.height) <= 6) {
      score += 5;
    }

    if (style.borderRadius.includes("%") || borderRadiusValue >= Math.min(rect.width, rect.height) / 2 - 1) {
      score += 6;
    }

    if (style.position === "absolute" || style.position === "fixed") {
      score += 3;
    }

    score += Math.max(0, 8 - Math.abs(centerY - sliderCenterY));
    score += Math.max(0, 10 - Math.abs(centerX - expectedCenterX) / 4);

    if (
      style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      style.borderColor !== "rgba(0, 0, 0, 0)" ||
      style.boxShadow !== "none"
    ) {
      score += 2;
    }

    return score;
  }

  function findSeekHandle(slider, progressPercent) {
    const sliderRect = slider.getBoundingClientRect();
    const expectedCenterX = sliderRect.left + sliderRect.width * progressPercent;
    const descendants = slider.querySelectorAll("*");

    let bestHandle = null;
    let bestScore = -1;

    for (const node of descendants) {
      const score = scoreHandleCandidate(node, sliderRect, expectedCenterX);
      if (score > bestScore) {
        bestScore = score;
        bestHandle = node;
      }
    }

    return bestScore >= 10 ? bestHandle : null;
  }

  function ensureCustomHandle(slider) {
    let handle = slider.querySelector(`.${CUSTOM_HANDLE_CLASS}`);
    if (handle instanceof HTMLElement) {
      return handle;
    }

    handle = document.createElement("div");
    handle.className = CUSTOM_HANDLE_CLASS;
    slider.appendChild(handle);
    return handle;
  }

  function ensureOverlayParts() {
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
      document.body.appendChild(overlay);
    }

    const track = overlay.querySelector(`.${CUSTOM_OVERLAY_TRACK_CLASS}`);
    const fill = overlay.querySelector(`.${CUSTOM_OVERLAY_FILL_CLASS}`);
    const handle = overlay.querySelector(`.${CUSTOM_HANDLE_CLASS}`);

    if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement) || !(handle instanceof HTMLElement)) {
      return null;
    }

    return { overlay, track, fill, handle };
  }

  function hideOverlay() {
    const overlay = document.querySelector(`.${CUSTOM_OVERLAY_CLASS}`);
    if (overlay instanceof HTMLElement) {
      overlay.style.display = "none";
    }
  }

  function syncSeekHandleAppearance() {
    if (!isKickVodPage()) {
      hideOverlay();
      return;
    }

    const video = getVisibleVideo();
    if (!video) {
      hideOverlay();
      return;
    }

    const slider = getSeekSlider(video);
    const timelineRect = getTimelineRect(video, slider);
    if (!timelineRect) {
      hideOverlay();
      return;
    }

    ensureHandleStyle();

    const progressPercent = slider instanceof HTMLElement
      ? getSliderProgressPercent(slider, video)
      : clamp(video.currentTime / video.duration, 0, 1);
    const overlayParts = ensureOverlayParts();
    if (!overlayParts) {
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

    overlayParts.overlay.style.display = "block";
    overlayParts.overlay.style.left = `${timelineRect.left}px`;
    overlayParts.overlay.style.top = `${timelineRect.top}px`;
    overlayParts.overlay.style.width = `${timelineRect.width}px`;
    overlayParts.overlay.style.height = `${timelineRect.height}px`;
    overlayParts.fill.style.width = `${fillWidth}px`;
    overlayParts.handle.style.left = `${handleLeft}px`;
    overlayParts.handle.style.height = `${handleHeight}px`;
  }

  let seekHandleUpdateQueued = false;

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

      if (typeof video.fastSeek === "function") {
        video.fastSeek(targetTime);
      } else {
        video.currentTime = targetTime;
      }

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

  const observer = new MutationObserver(() => {
    scheduleSeekHandleAppearanceSync();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-valuenow", "aria-valuemin", "aria-valuemax", "style", "class"]
  });

  document.addEventListener("click", seekVideoFromClick, true);
  document.addEventListener("pointermove", scheduleSeekHandleAppearanceSync, true);
  document.addEventListener("timeupdate", scheduleSeekHandleAppearanceSync, true);
  window.addEventListener("resize", scheduleSeekHandleAppearanceSync, { passive: true });
  window.addEventListener("load", scheduleSeekHandleAppearanceSync, { once: true });
  scheduleSeekHandleAppearanceSync();
})();
