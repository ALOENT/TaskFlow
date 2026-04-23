/**
 * Sanitize a string to prevent XSS.
 * Strips HTML tags and encodes special characters.
 */
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  // First strip tags
  const stripped = str.replace(/<[^>]*>?/gm, '');
  // Then encode special chars
  return stripped.replace(/[&<>"']/g, function(m) { return map[m]; });
}
