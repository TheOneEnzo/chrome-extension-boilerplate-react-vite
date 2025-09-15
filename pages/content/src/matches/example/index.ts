// content.ts
// Runs in the page. Detects text selection and requests translation from the background service worker.
let tooltip: HTMLDivElement | null = null;
let lastSelection: string = '';

const removeTooltip = (): void => {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
};

const showTooltip = (text: string, rect: DOMRect | { top: number; left: number }): void => {
  if (!text || text.trim() === '') return; // Prevent empty bubble
  removeTooltip();

  const div = document.createElement('div');
  div.className = 'translation-tooltip';
  div.innerText = text;

  // position
  const top = window.scrollY + Math.max(0, rect.top - 36);
  const left = window.scrollX + Math.max(0, rect.left);
  div.style.top = `${top}px`;
  div.style.left = `${left}px`;

  document.body.appendChild(div);
  tooltip = div;

  // auto-hide after 7s
  setTimeout(() => {
    if (tooltip) tooltip.remove();
    tooltip = null;
  }, 7000);
};

document.addEventListener('mousedown', () => {
  // hide tooltip when the user starts a new interaction
  removeTooltip();
});

document.addEventListener('mouseup', (ev: MouseEvent) => {
  const selection = window.getSelection();
  const selectedText: string = selection?.toString().trim() ?? '';

  if (!selectedText) {
    lastSelection = '';
    return;
  }

  // Apply 50-character limit
  const truncatedText = selectedText.length > 50 ? selectedText.substring(0, 50) : selectedText;

  if (truncatedText === lastSelection) return; // avoid duplicate requests
  lastSelection = truncatedText;

  // get bounding rect for positioning
  let rect: DOMRect | { top: number; left: number };
  try {
    const range = selection?.getRangeAt(0);
    rect = range ? range.getBoundingClientRect() : { top: ev.clientY, left: ev.clientX };
  } catch {
    rect = { top: ev.clientY, left: ev.clientX };
  }

  // send to background to translate, including the current page URL
  chrome.runtime.sendMessage(
    {
      type: 'translate',
      text: truncatedText, // Send the truncated text instead of full selection
      url: window.location.href, // Include the current page URL
    },
    (response?: { translation?: string }) => {
      if (!response || !response.translation) return; // nothing to show
      showTooltip(response.translation, rect);
    },
  );
});
