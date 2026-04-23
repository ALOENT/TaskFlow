import DOMPurify from 'dompurify';

/**
 * Sanitize a string to prevent XSS using DOMPurify.
 */
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return DOMPurify.sanitize(str, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target']
  });
}
