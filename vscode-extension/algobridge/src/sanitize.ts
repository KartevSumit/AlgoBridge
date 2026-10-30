import * as crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

const NONCE_REGEX = /^[A-Za-z0-9+/=]+$/;

export function buildCsp(cspSource: string, nonce: string): string {
  if (!cspSource || !cspSource.trim()) {
    throw new Error('cspSource cannot be empty');
  }
  if (!nonce || !NONCE_REGEX.test(nonce) || /[';\s]/.test(nonce)) {
    throw new Error('Invalid nonce');
  }
  return [
    `default-src 'none'`,
    `base-uri 'none'`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} https: data:`,
  ].join('; ');
}

const ALLOWED_TAGS = [
  'div',
  'span',
  'p',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'ul',
  'ol',
  'li',
  'b',
  'strong',
  'i',
  'em',
  'sub',
  'sup',
  'img',
  'br',
  'hr',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
];

const NON_TEXT_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
];

const ALLOWED_STYLES_REGEX = {
  color: [/^[\w#(),. -]+$/],
  'background-color': [/^[\w#(),. -]+$/],
  'text-align': [/^[\w-]+$/],
  'font-weight': [/^[\w-]+$/],
  'font-style': [/^[\w-]+$/],
  'text-decoration': [/^[\w-]+$/],
  width: [/^[\d.]+(px|em|rem|%|vw|vh|cm|mm|in|pt|pc)$/i],
  height: [/^[\d.]+(px|em|rem|%|vw|vh|cm|mm|in|pt|pc)$/i],
  'vertical-align': [/^[\w.-]+$/],
  'white-space': [/^[\w-]+$/],
  margin: [/^[\d.pxemrem% -]+$/i],
  'margin-top': [/^[\d.pxemrem% -]+$/i],
  'margin-bottom': [/^[\d.pxemrem% -]+$/i],
  'margin-left': [/^[\d.pxemrem% -]+$/i],
  'margin-right': [/^[\d.pxemrem% -]+$/i],
  padding: [/^[\d.pxemrem% -]+$/i],
  'padding-top': [/^[\d.pxemrem% -]+$/i],
  'padding-bottom': [/^[\d.pxemrem% -]+$/i],
  'padding-left': [/^[\d.pxemrem% -]+$/i],
  'padding-right': [/^[\d.pxemrem% -]+$/i],
  border: [/^[\w.#() -]+$/],
  'border-top': [/^[\w.#() -]+$/],
  'border-bottom': [/^[\w.#() -]+$/],
  'border-left': [/^[\w.#() -]+$/],
  'border-right': [/^[\w.#() -]+$/],
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  disallowedTagsMode: 'discard',
  nonTextTags: NON_TEXT_TAGS,
  allowedAttributes: {
    '*': ['class', 'id', 'title', 'style', 'data-*'],
    img: ['src', 'alt', 'title', 'loading', 'referrerpolicy'],
  },
  allowedStyles: {
    '*': ALLOWED_STYLES_REGEX,
  },
  allowedSchemes: ['https', 'data'],
  allowedSchemesByTag: {
    img: ['https', 'data'],
  },
  transformTags: {
    '*': (tagName, attribs) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(attribs)) {
        if (!k.toLowerCase().startsWith('on')) {
          clean[k] = v;
        }
      }
      if (clean.style) {
        const s = clean.style.toLowerCase();
        if (
          s.includes('url(') ||
          s.includes('expression(') ||
          s.includes('@import') ||
          s.includes('javascript:')
        ) {
          delete clean.style;
        }
      }
      return { tagName, attribs: clean };
    },
    img: (tagName, attribs) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(attribs)) {
        if (!k.toLowerCase().startsWith('on')) {
          clean[k] = v;
        }
      }
      const src = (clean.src || '').trim();
      const isHttps = /^https:\/\/[^\s]+$/i.test(src);
      const isDataRaster = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(src);
      if (isHttps || isDataRaster) {
        clean.src = src;
      } else {
        delete clean.src;
      }
      clean.loading = 'lazy';
      clean.referrerpolicy = 'no-referrer';
      return { tagName: 'img', attribs: clean };
    },
  },
  parser: {
    lowerCaseTags: true,
  },
};

const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2 MB

export function sanitizeStatementHtml(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  if (!raw.trim()) {
    return '';
  }
  if (raw.length > MAX_PAYLOAD_SIZE) {
    return '';
  }
  try {
    return sanitizeHtml(raw, SANITIZE_OPTIONS);
  } catch (err) {
    console.warn('[AlgoBridge] Statement sanitization failed');
    return '<pre>' + escapeHtml(String(raw)) + '</pre>';
  }
}
