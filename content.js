(() => {
  "use strict";

  const SEEK_PATTERN = /seek|scrub|progress|timeline|slider|track|rail|bar/i;
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

  document.addEventListener("click", seekVideoFromClick, true);
})();
