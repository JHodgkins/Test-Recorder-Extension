// contentScript.js

// Example descriptive function
function getElementDescription(element) {
  if (!element) return "Unknown Element";
  if (element.innerText && element.innerText.trim().length > 0) {
    return element.innerText.trim();
  } else if (element.value && element.value.trim().length > 0) {
    return element.value.trim();
  }
  return element.tagName.toLowerCase();
}

function sendEventRecorded(eventType, target) {
  const boundingRect = target.getBoundingClientRect();
  const elementDescription = getElementDescription(target);

  chrome.runtime.sendMessage({
    type: "EVENT_RECORDED",
    eventType,
    elementDescription,
    boundingRect: {
      x: boundingRect.x,
      y: boundingRect.y,
      width: boundingRect.width,
      height: boundingRect.height
    }
  });
}

// 1) Listen for clicks
document.addEventListener(
  "click",
  (e) => {
    sendEventRecorded("Left Click", e.target);
  },
  true
);

// 2) Listen for right-click
document.addEventListener(
  "contextmenu",
  (e) => {
    sendEventRecorded("Right Click", e.target);
  },
  true
);

// 3) Listen for relevant keys
document.addEventListener(
  "keydown",
  (e) => {
    const relevantKeys = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab", " "];
    if (relevantKeys.includes(e.key) || e.key === " ") {
      const actionName = e.key === " " ? "Space" : e.key;
      sendEventRecorded(`Key: ${actionName}`, e.target);
    }
  },
  true
);

// 4) Handle screenshot annotation
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANNOTATE_SCREENSHOT") {
    try {
      const { boundingRect, screenshotDataUrl } = msg;
      const image = document.createElement("img");
      image.src = screenshotDataUrl;

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        // Basic scaling approach
        const scaleX = image.width / window.innerWidth;
        const scaleY = image.height / window.innerHeight;

        const x = boundingRect.x * scaleX;
        const y = boundingRect.y * scaleY;
        const w = boundingRect.width * scaleX;
        const h = boundingRect.height * scaleY;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        const annotatedScreenshot = canvas.toDataURL("image/png");
        sendResponse({ annotatedScreenshot });
      };
    } catch (err) {
      console.error("Error annotating screenshot:", err);
      sendResponse({});
    }
    // Return true for async response
    return true;
  }
});
