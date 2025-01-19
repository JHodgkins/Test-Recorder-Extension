// service_worker.js

let recordingState = {
  isRecording: false,
  isPaused: false,
  testPlanName: "",
  steps: []
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "START_RECORDING":
      recordingState.isRecording = true;
      recordingState.isPaused = false;
      recordingState.testPlanName = message.testPlanName || "";
      recordingState.steps = [];
      sendResponse({ status: "recording_started" });
      break;

    case "PAUSE_RECORDING":
      recordingState.isPaused = true;
      sendResponse({ status: "recording_paused" });
      break;

    case "RESUME_RECORDING":
      recordingState.isPaused = false;
      sendResponse({ status: "recording_resumed" });
      break;

    case "STOP_RECORDING":
      recordingState.isRecording = false;
      sendResponse({
        status: "recording_stopped",
        steps: recordingState.steps,
        testPlanName: recordingState.testPlanName
      });
      break;

    case "EVENT_RECORDED":
      if (recordingState.isRecording && !recordingState.isPaused) {
        const { eventType, elementDescription, boundingRect } = message;

        // 1) Capture the visible tab (async)
        chrome.tabs.captureVisibleTab().then((dataUrl) => {
          // 2) Attempt to annotate via content script
          const tabId = sender.tab?.id;
          if (tabId == null) {
            console.warn("No sender tab found; storing raw screenshot only.");
            recordStep(eventType, elementDescription, dataUrl);
            return;
          }

          chrome.tabs.sendMessage(
            tabId,
            {
              type: "ANNOTATE_SCREENSHOT",
              boundingRect,
              screenshotDataUrl: dataUrl
            },
            (response) => {
              if (chrome.runtime.lastError) {
                // Could not reach content script => fallback: raw screenshot
                console.warn("Content script unreachable:", chrome.runtime.lastError.message);
                recordStep(eventType, elementDescription, dataUrl);
              } else if (!response || !response.annotatedScreenshot) {
                // The script returned nothing => fallback
                console.warn("No annotated screenshot returned; storing raw screenshot.");
                recordStep(eventType, elementDescription, dataUrl);
              } else {
                // Annotated screenshot is returned
                recordStep(eventType, elementDescription, response.annotatedScreenshot);
              }
            }
          );
        });
      }
      sendResponse({ status: "ok" });

      // IMPORTANT: keep the channel open for async calls
      return true;

    case "GET_RECORDING_STATE":
      sendResponse({
        testPlanName: recordingState.testPlanName,
        steps: recordingState.steps,
        isRecording: recordingState.isRecording,
        isPaused: recordingState.isPaused
      });
      break;

    default:
      console.warn("Unknown message type:", message.type);
      break;
  }
});

/**
 * Finalizes the step (pushes to array + notifies popup).
 */
function recordStep(eventType, elementDescription, screenshotUrl) {
  recordingState.steps.push({
    stepNumber: recordingState.steps.length + 1,
    eventType,
    elementDescription,
    screenshot: screenshotUrl
  });

  // Notify the popup if open
  chrome.runtime.sendMessage({
    type: "STEPS_UPDATED",
    steps: recordingState.steps
  });
}
