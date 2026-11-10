// content.ts
// Runs in the page. Detects text selection and requests translation from the background service worker.
type TriggerMode = 'always' | 'modifier';

let tooltip: HTMLDivElement | null = null;
let lastSelection: string = '';
let translationCharLimit = 50;
let triggerMode: TriggerMode = 'always';
// 'system' follows the OS; 'light' / 'dark' are set from the popup's theme button.
let theme: 'system' | 'light' | 'dark' = 'system';

const parseTriggerMode = (value: unknown): TriggerMode => (value === 'modifier' ? 'modifier' : 'always');
const parseTheme = (value: unknown): typeof theme => (value === 'light' || value === 'dark' ? value : 'system');

chrome.storage.local.get({ translationCharLimit: 50, triggerMode: 'always', theme: 'system' }, res => {
  translationCharLimit = Number(res.translationCharLimit) || 50;
  triggerMode = parseTriggerMode(res.triggerMode);
  theme = parseTheme(res.theme);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.translationCharLimit) {
    translationCharLimit = Number(changes.translationCharLimit.newValue) || 50;
  }
  if (changes.triggerMode) {
    triggerMode = parseTriggerMode(changes.triggerMode.newValue);
  }
  if (changes.theme) {
    theme = parseTheme(changes.theme.newValue);
  }
});

// Selections made while typing or editing (inputs, textareas, rich text editors) are
// never meant to be translated.
const isEditableTarget = (selection: Selection | null): boolean => {
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
    return true;
  }
  const anchor = selection?.anchorNode;
  const el = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
  return !!el?.isContentEditable;
};

// Numbers, symbols and punctuation have nothing to translate.
const hasLetters = (text: string): boolean => /\p{L}/u.test(text);

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
  div.className = theme === 'system' ? 'translation-tooltip' : `translation-tooltip ht-theme-${theme}`;
  div.innerText = text;

  const top = window.scrollY + Math.max(0, rect.top - 36);
  const left = window.scrollX + Math.max(0, rect.left);
  div.style.top = `${top}px`;
  div.style.left = `${left}px`;

  document.body.appendChild(div);
  tooltip = div;
};

document.addEventListener('mousedown', removeTooltip);

document.addEventListener('mouseup', (ev: MouseEvent) => {
  const selection = window.getSelection();
  const selectedText: string = selection?.toString().trim() ?? '';

  if (!selectedText) {
    lastSelection = '';
    return;
  }

  // Only translate on purpose: these are the usual ways regular highlighting (copying,
  // selecting a paragraph, editing text) used to burn through the monthly characters.
  if (triggerMode === 'modifier' && !ev.altKey) return;
  if (isEditableTarget(selection)) return;
  if (!hasLetters(selectedText)) return;
  // Longer than the per-translation limit: almost always a paragraph being selected for
  // another reason. Skip it instead of translating a cut-off fragment.
  if (selectedText.length > translationCharLimit) return;

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

  // --- Grab context around the selection ---
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
    contextText = selectedText; // fallback to the selection itself
  }

  // Optional: truncate context for tooltip/translation requests
  const truncatedContext = contextText.length > 300 ? contextText.substring(0, 300) : contextText;

  // Send to background for translation
  chrome.runtime.sendMessage(
    {
      type: 'translate',
      highlightedWord: selectedText, // The selected word or phrase
      text: truncatedContext, // The surrounding context
      url: window.location.href,
    },
    (response?: { translation?: string }) => {
      if (!response || !response.translation) return;
      showTooltip(response.translation, rect);
    },
  );
});
