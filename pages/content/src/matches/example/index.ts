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
  if (!text || text.trim() === '') return;
  removeTooltip();

  const div = document.createElement('div');
  div.className = 'translation-tooltip';
  div.innerText = text;

  const top = window.scrollY + Math.max(0, rect.top - 36);
  const left = window.scrollX + Math.max(0, rect.left);
  div.style.top = `${top}px`;
  div.style.left = `${left}px`;

  document.body.appendChild(div);
  tooltip = div;

  setTimeout(() => {
    if (tooltip) tooltip.remove();
    tooltip = null;
  }, 7000);
};

document.addEventListener('mousedown', removeTooltip);

document.addEventListener('mouseup', (ev: MouseEvent) => {
  const selection = window.getSelection();
  const selectedText: string = selection?.toString().trim() ?? '';

  if (!selectedText) {
    lastSelection = '';
    return;
  }

  // Avoid duplicate requests
  if (selectedText === lastSelection) return;
  lastSelection = selectedText;

  // Determine bounding rect for tooltip
  let rect: DOMRect | { top: number; left: number };
  try {
    const range = selection?.getRangeAt(0);
    rect = range ? range.getBoundingClientRect() : { top: ev.clientY, left: ev.clientX };
  } catch {
    rect = { top: ev.clientY, left: ev.clientX };
  }

  // --- NEW: Grab context around the selection ---
  let contextText = selectedText;

  try {
    const range = selection?.getRangeAt(0);
    if (range) {
      const node = range.startContainer;
      const blockElement = node.parentElement?.closest('p, div, li, span') ?? node.parentElement;

      if (blockElement) {
        const blockText = (blockElement as HTMLElement).innerText;

        // Split into sentences
        const sentences = blockText.match(/[^.!?]+[.!?]+/g) || [blockText];

        // Find the sentence containing the selection
        const idx = sentences.findIndex(s => s.includes(selectedText));

        if (idx !== -1) {
          const before = sentences[idx - 1] || '';
          const current = sentences[idx];
          const after = sentences[idx + 1] || '';
          contextText = [before, current, after].filter(Boolean).join(' ').trim();
        }
      }
    }
  } catch (err) {
    console.error('Error grabbing context:', err);
    contextText = selectedText; // fallback to selection only
  }

  // Optional: truncate context for tooltip/translation requests
  const truncatedText = contextText.length > 300 ? contextText.substring(0, 300) : contextText;

  // Send to background for translation
  chrome.runtime.sendMessage(
    {
      type: 'translate',
      highlightedWord: selectedText,    // The actual word user highlighted
      text: contextText,                // The surrounding context
      url: window.location.href,
    },
    (response?: { translation?: string }) => {
      if (!response || !response.translation) return;
      showTooltip(response.translation, rect);
    },
  );
});
