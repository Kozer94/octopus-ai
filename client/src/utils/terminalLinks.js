const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCTUATION = /[),.;\]]+$/;

export function splitTerminalLinks(text = '') {
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index;
    const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch?.[0] || '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

    if (start > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    parts.push({ type: 'link', value: url });
    if (trailing) parts.push({ type: 'text', value: trailing });
    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', value: text }];
}
