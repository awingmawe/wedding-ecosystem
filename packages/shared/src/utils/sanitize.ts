import sanitizeHtml from 'sanitize-html';

/**
 * Allowed HTML tags for rich text fields (wishes/messages).
 * Only basic formatting tags are permitted.
 */
const RICH_TEXT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'];

/**
 * Allowed attributes for rich text fields.
 * Only href on anchor tags, restricted to http/https protocols.
 */
const RICH_TEXT_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href'],
};

/**
 * Only allow http:// and https:// protocols in href attributes.
 */
const ALLOWED_SCHEMES = ['http', 'https'];

/**
 * Sanitizes plain text input by stripping ALL HTML tags.
 * Use for fields like guest names, slugs, and other plain text inputs.
 *
 * @param input - The raw user input string
 * @returns The sanitized string with all HTML removed
 */
export function sanitizePlainText(input: string): string {
  if (!input) return input;

  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Sanitizes rich text input by allowing only a safe subset of HTML tags.
 * Removes all event handlers, javascript: URLs, data: URLs, and dangerous tags.
 * Use for fields like wishes/messages that support basic formatting.
 *
 * @param input - The raw user input string (may contain HTML)
 * @returns The sanitized HTML string with only safe tags/attributes
 */
export function sanitizeRichText(input: string): string {
  if (!input) return input;

  return sanitizeHtml(input, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: RICH_TEXT_ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    // Strip disallowed tags entirely (don't escape them)
    disallowedTagsMode: 'discard',
    // Don't allow any CSS/style attributes
    allowedStyles: {},
    // Explicitly disallow protocol-relative URLs
    allowProtocolRelative: false,
  });
}
