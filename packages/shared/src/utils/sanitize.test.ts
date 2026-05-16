import { describe, it, expect } from 'vitest';
import { sanitizePlainText, sanitizeRichText } from './sanitize';

describe('sanitizePlainText', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizePlainText('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizePlainText('John Doe')).toBe('John Doe');
  });

  it('strips all HTML tags from input', () => {
    expect(sanitizePlainText('<b>John</b> <i>Doe</i>')).toBe('John Doe');
  });

  it('removes script tags and their content', () => {
    expect(sanitizePlainText('Hello<script>alert("xss")</script>World')).toBe('HelloWorld');
  });

  it('removes event handler attributes', () => {
    expect(sanitizePlainText('<div onclick="alert(1)">Name</div>')).toBe('Name');
  });

  it('removes img tags with onerror handlers', () => {
    expect(sanitizePlainText('<img src=x onerror="alert(1)">')).toBe('');
  });

  it('removes iframe tags', () => {
    expect(sanitizePlainText('<iframe src="https://evil.com"></iframe>Guest')).toBe('Guest');
  });

  it('handles nested malicious tags', () => {
    expect(sanitizePlainText('<div><script>alert(1)</script>Safe</div>')).toBe('Safe');
  });

  it('preserves unicode characters in names', () => {
    expect(sanitizePlainText('Müller & Söhne')).toBe('Müller &amp; Söhne');
  });

  it('handles Indonesian names with special characters', () => {
    expect(sanitizePlainText("Budi Santoso & Siti Nur'aini")).toBe(
      "Budi Santoso &amp; Siti Nur'aini"
    );
  });
});

describe('sanitizeRichText', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeRichText('')).toBe('');
  });

  it('allows basic formatting tags', () => {
    const input = '<b>Bold</b> <i>Italic</i> <em>Emphasis</em> <strong>Strong</strong>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('allows paragraph and line break tags', () => {
    const input = '<p>Paragraph</p><br />';
    expect(sanitizeRichText(input)).toContain('<p>');
    expect(sanitizeRichText(input)).toContain('<br');
  });

  it('allows list tags', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('allows ordered list tags', () => {
    const input = '<ol><li>First</li><li>Second</li></ol>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('allows anchor tags with https href', () => {
    const input = '<a href="https://example.com">Link</a>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('allows anchor tags with http href', () => {
    const input = '<a href="http://example.com">Link</a>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  // XSS Prevention Tests
  it('removes script tags completely', () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(sanitizeRichText(input)).toBe('<p>Hello</p><p>World</p>');
  });

  it('removes iframe tags', () => {
    const input = '<p>Text</p><iframe src="https://evil.com"></iframe>';
    expect(sanitizeRichText(input)).toBe('<p>Text</p>');
  });

  it('removes object tags', () => {
    const input = '<object data="evil.swf"></object><p>Safe</p>';
    expect(sanitizeRichText(input)).toBe('<p>Safe</p>');
  });

  it('removes embed tags', () => {
    const input = '<embed src="evil.swf"><p>Safe</p>';
    expect(sanitizeRichText(input)).toBe('<p>Safe</p>');
  });

  it('removes form and input tags', () => {
    const input = '<form action="/steal"><input type="text"></form><p>Safe</p>';
    expect(sanitizeRichText(input)).toBe('<p>Safe</p>');
  });

  it('removes onclick event handlers', () => {
    const input = '<p onclick="alert(1)">Click me</p>';
    expect(sanitizeRichText(input)).toBe('<p>Click me</p>');
  });

  it('removes onerror event handlers', () => {
    const input = '<img src=x onerror="alert(1)"><p>Text</p>';
    expect(sanitizeRichText(input)).toBe('<p>Text</p>');
  });

  it('removes onload event handlers', () => {
    const input = '<body onload="alert(1)"><p>Text</p></body>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('onload');
    expect(result).toContain('<p>Text</p>');
  });

  it('removes javascript: URLs from href', () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('javascript:');
  });

  it('removes data: URLs from href', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('data:');
  });

  it('removes style attributes', () => {
    const input = '<p style="background:url(javascript:alert(1))">Text</p>';
    expect(sanitizeRichText(input)).toBe('<p>Text</p>');
  });

  it('handles SVG-based XSS vectors', () => {
    const input = '<svg onload="alert(1)"><p>Safe</p></svg>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('svg');
    expect(result).not.toContain('onload');
    expect(result).toContain('<p>Safe</p>');
  });

  it('handles mixed safe and unsafe content', () => {
    const input = '<b>Bold</b><script>evil()</script><i>Italic</i><iframe src="x"></iframe>';
    expect(sanitizeRichText(input)).toBe('<b>Bold</b><i>Italic</i>');
  });

  it('removes protocol-relative URLs', () => {
    const input = '<a href="//evil.com/steal">Link</a>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('//evil.com');
  });

  it('preserves text content while removing dangerous tags', () => {
    const input = '<div><span>Hello</span> <b>World</b></div>';
    const result = sanitizeRichText(input);
    expect(result).toContain('Hello');
    expect(result).toContain('<b>World</b>');
  });
});
