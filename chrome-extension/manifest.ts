import { readFileSync } from 'node:fs';
import type { ManifestType } from '@extension/shared';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: 'Highlight Translator',
  version: '1.0',
  description: 'Highlight any text to translate instantly and save for flashcards.',
  permissions: ['storage', 'activeTab', 'scripting'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content/example.iife.js'],
      css: ['tooltip.css']
    }
  ],
  action: {
    default_popup: 'popup/index.html',
    default_icon: 'icon.png'
  },
  options_page: 'new-tab/index.html',
  icons: {
    '48': 'icon.png'
  },
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', 'icon.png'],
      matches: ['*://*/*'],
    },
  ],
} satisfies ManifestType;

export default manifest;