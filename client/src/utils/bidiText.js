const RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;

export function getTextDirection(text = '') {
  return RTL_PATTERN.test(String(text)) ? 'rtl' : 'ltr';
}

export function bidiPlainTextStyle(extra = {}) {
  return {
    unicodeBidi: 'plaintext',
    textAlign: 'start',
    ...extra,
  };
}

export function bidiIsolateStyle(extra = {}) {
  return {
    unicodeBidi: 'isolate',
    textAlign: 'start',
    ...extra,
  };
}

export function codeTextStyle(extra = {}) {
  return {
    direction: 'ltr',
    unicodeBidi: 'plaintext',
    textAlign: 'left',
    ...extra,
  };
}
