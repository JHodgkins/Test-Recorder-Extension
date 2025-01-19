// popup.js

let steps = [];
let testPlanNameInput = null;

document.addEventListener("DOMContentLoaded", () => {
  testPlanNameInput = document.getElementById("testPlanName");

  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const stopBtn = document.getElementById("stopBtn");

  startBtn.addEventListener("click", onStart);
  pauseBtn.addEventListener("click", onPause);
  resumeBtn.addEventListener("click", onResume);
  stopBtn.addEventListener("click", onStop);

  // =========================================
  // 1) Fetch the current recording state
  // =========================================
  chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
    if (response) {
      steps = response.steps || [];
      testPlanNameInput.value = response.testPlanName || "";
      renderSteps();
    }
  });

  // 2) Listen for step updates from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STEPS_UPDATED") {
      steps = message.steps || [];
      renderSteps();
    }
  });
});

function onStart() {
  const testPlanName = testPlanNameInput.value.trim() || "UntitledTestPlan";
  chrome.runtime.sendMessage({ type: "START_RECORDING", testPlanName }, (response) => {
    console.log("Recording started:", response);
  });
}

function onPause() {
  chrome.runtime.sendMessage({ type: "PAUSE_RECORDING" }, (response) => {
    console.log("Recording paused:", response);
  });
}

function onResume() {
  chrome.runtime.sendMessage({ type: "RESUME_RECORDING" }, (response) => {
    console.log("Recording resumed:", response);
  });
}

/**
 * STOP: fetch recorded steps, generate CSV and ZIP with screenshots.
 * The fix ensures we safely handle missing eventType or screenshot fields.
 */
async function onStop() {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, async (response) => {
    console.log("Recording stopped:", response);

    // If for some reason there's no response, or no steps:
    if (!response || !response.steps) {
      alert("No steps were recorded or an error occurred.");
      return;
    }

    steps = response.steps || [];
    const planName = response.testPlanName || "TestPlan";

    // 1) Download CSV
    const csvContent = generateCSV(steps);
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const csvFilename = `${planName}_Steps.csv`;
    saveAs(csvBlob, csvFilename);

    // 2) Download screenshots as ZIP
    const zip = new JSZip();
    steps.forEach((step) => {
      // If no screenshot, skip it to avoid .split() error
      if (!step.screenshot) return;

      // Safely extract base64 from "data:image/png;base64,XXX"
      const parts = step.screenshot.split(";base64,");
      const base64Image = parts[1] || "";

      // Safely handle eventType for filename
      const safeEventType = step.eventType
        ? step.eventType.replace(/\s+/g, "")
        : "NoEventType";

      const stepNumber = step.stepNumber || 1;
      const screenshotFilename = `Step${stepNumber}_${safeEventType}.png`;

      zip.file(screenshotFilename, base64Image, { base64: true });
    });

    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `${planName}_Screenshots.zip`);

    // Reset local steps
    steps = [];
    renderSteps();
    testPlanNameInput.value = "";
  });
}

function renderSteps() {
  const tbody = document.getElementById("stepsBody");
  tbody.innerHTML = "";

  steps.forEach((step) => {
    const row = document.createElement("tr");

    const stepCell = document.createElement("td");
    stepCell.textContent = step.stepNumber;

    const eventCell = document.createElement("td");
    eventCell.textContent = step.eventType;

    const elementCell = document.createElement("td");
    elementCell.textContent = step.elementDescription;

    const screenshotCell = document.createElement("td");
    if (step.screenshot) {
      const img = document.createElement("img");
      img.src = step.screenshot;
      img.width = 100;
      screenshotCell.appendChild(img);
    }

    row.appendChild(stepCell);
    row.appendChild(eventCell);
    row.appendChild(elementCell);
    row.appendChild(screenshotCell);

    tbody.appendChild(row);
  });
}

function generateCSV(stepsArray) {
  let csv = "StepNumber,EventType,ElementDescription\n";
  stepsArray.forEach((step) => {
    const stepNo = step.stepNumber || "";
    const safeEventType = step.eventType
      ? step.eventType.replace(/"/g, '""')
      : "NoEventType";
    const safeDesc = step.elementDescription
      ? step.elementDescription.replace(/"/g, '""')
      : "NoDescription";

    csv += `${stepNo},"${safeEventType}","${safeDesc}"\n`;
  });
  return csv;
}
