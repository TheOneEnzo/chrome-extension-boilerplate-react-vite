// content.ts
// Runs in the page. Detects text selection and requests translation from the background service worker.
let tooltip: HTMLDivElement | null = null;
let lastSelection: string = "";

function removeTooltip(): void {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

function showTooltip(text: string, rect: DOMRect | { top: number; left: number }): void {
  if (!text || text.trim() === "") return; // Prevent empty bubble
  removeTooltip();

  const div = document.createElement("div");
  div.className = "translation-tooltip";
  div.innerText = text;

  // position
  const top = window.scrollY + Math.max(0, rect.top - 36);
  const left = window.scrollX + Math.max(0, rect.left);
  div.style.top = `${top}px`;
  div.style.left = `${left}px`;

  document.body.appendChild(div);
  tooltip = div;

  // auto-hide after 5s
  setTimeout(() => {
    if (tooltip) tooltip.remove();
    tooltip = null;
  }, 5000);
}

document.addEventListener("mousedown", () => {
  // hide tooltip when the user starts a new interaction
  removeTooltip();
});

document.addEventListener("mouseup", (ev: MouseEvent) => {
  const selection = window.getSelection();
  const selectedText: string = selection?.toString().trim() ?? "";

  if (!selectedText) {
    lastSelection = "";
    return;
  }

  if (selectedText === lastSelection) return; // avoid duplicate requests
  lastSelection = selectedText;

  // get bounding rect for positioning
  let rect: DOMRect | { top: number; left: number };
  try {
    const range = selection?.getRangeAt(0);
    rect = range ? range.getBoundingClientRect() : { top: ev.clientY, left: ev.clientX };
  } catch {
    rect = { top: ev.clientY, left: ev.clientX };
  }

  // send to background to translate
  chrome.runtime.sendMessage(
    { type: "translate", text: selectedText },
    (response?: { translation?: string }) => {
      if (!response || !response.translation) return; // nothing to show
      showTooltip(response.translation, rect);
    }
  );
});
