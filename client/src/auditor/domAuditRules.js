function getStyle(el, prop) {
  return getComputedStyle(el).getPropertyValue(prop).trim();
}

function isHudElement(el) {
  return !!el.closest?.('[data-hud]');
}

function queryAuditElements(selector) {
  return [...document.querySelectorAll(selector)].filter(el => !isHudElement(el));
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function isUiChromeText(el) {
  const text = el.textContent.trim();
  if (text.length < 24) return true;
  if (el.closest('button, kbd, .codicon, [role="button"]')) return true;
  const style = getComputedStyle(el);
  return style.textTransform === 'uppercase' || style.fontFamily.toLowerCase().includes('monospace');
}

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
}

function luminance(rgb) {
  const [r, g, b] = rgb.slice(0, 3).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getEffectiveBackground(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const background = parseRgb(getStyle(node, 'background-color'));
    if (background && background[3] !== 0) return background;
    node = node.parentElement;
  }
  return parseRgb(getStyle(document.body, 'background-color')) || [255, 255, 255, 1];
}

function contrastRatio(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function describeElement(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    className: typeof el.className === 'string' ? el.className : '',
    text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
    outerHTML: el.outerHTML.slice(0, 900),
    style: {
      display: style.display,
      width: style.width,
      maxWidth: style.maxWidth,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    },
    rect: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function addIssue(issues, id, severity, elements, message, fix, autoFixed = false) {
  if (elements.length === 0) return;
  issues.push({
    id,
    severity,
    violated: true,
    message,
    fix,
    autoFixed,
    count: elements.length,
    examples: elements.slice(0, 3).map(describeElement),
    category: 'DOM_AUDIT',
    description: `${elements.length} matching element(s)`,
  });
}

function addPass(passed, id) {
  passed.push({
    id,
    severity: 'info',
    violated: false,
    message: 'Rule passed',
    fix: '',
    category: 'DOM_AUDIT',
    description: 'No matching issue found',
  });
}

function ensureStyle(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function record(issues, passed, id, severity, elements, message, fix, autoFix) {
  if (elements.length === 0) {
    addPass(passed, id);
    return;
  }
  addIssue(issues, id, severity, elements, message, fix, autoFix);
}

export function runDomAudit({ autoFix = false } = {}) {
  const issues = [];
  const passed = [];
  const all = queryAuditElements('*');

  const missingTextOverflow = [];
  all.forEach(parent => {
    const display = getStyle(parent, 'display');
    if (!['flex', 'inline-flex', 'grid'].includes(display)) return;
    [...parent.children].forEach(child => {
      const style = getComputedStyle(child);
      if (
        child.scrollWidth > child.offsetWidth + 2 &&
        style.overflow !== 'hidden' &&
        style.textOverflow !== 'ellipsis'
      ) {
        missingTextOverflow.push(child);
      }
    });
  });
  if (autoFix && missingTextOverflow.length > 0) {
    ensureStyle('oct-text-overflow', '[data-oct-text-overflow]{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;min-width:0!important}');
    missingTextOverflow.forEach(el => el.setAttribute('data-oct-text-overflow', ''));
  }
  record(issues, passed, 'MISSING_TEXT_OVERFLOW', 'major', missingTextOverflow, 'Long text without overflow control in flex/grid.', 'Add overflow hidden, text-overflow ellipsis, white-space nowrap, and min-width:0.', autoFix);

  const gridMinWidth = all.filter(el => {
    const style = getComputedStyle(el);
    return style.display === 'grid' && style.gridTemplateColumns.includes('1fr') && !style.gridTemplateColumns.includes('minmax');
  });
  if (autoFix) gridMinWidth.forEach(el => [...el.children].forEach(child => { child.style.minWidth = '0'; }));
  record(issues, passed, 'GRID_MIN_WIDTH', 'major', gridMinWidth, 'Grid uses 1fr without minmax; child overflow risk.', 'Use minmax(0, 1fr) or add min-width:0 to grid children.', autoFix);

  const zIndexChaos = all.filter(el => {
    const z = Number.parseInt(getStyle(el, 'z-index'), 10);
    return !Number.isNaN(z) && Math.abs(z) > 99 && z % 100 !== 0;
  });
  record(issues, passed, 'Z_INDEX_CHAOS', 'minor', zIndexChaos, 'Arbitrary z-index values detected.', 'Use a scale such as 100, 200, 300.', false);

  const fixedWidth = all.filter(el => {
    const parentDisplay = el.parentElement ? getStyle(el.parentElement, 'display') : '';
    const width = el.style.width;
    const style = getComputedStyle(el);
    return ['flex', 'grid'].includes(parentDisplay) &&
      width.endsWith('px') &&
      Number.parseInt(width, 10) > 100 &&
      style.flexShrink !== '0';
  });
  if (autoFix) fixedWidth.forEach(el => { el.style.maxWidth = el.style.width; el.style.width = '100%'; });
  record(issues, passed, 'FIXED_WIDTH_IN_FLEX', 'major', fixedWidth, 'Fixed pixel width inside flex/grid.', 'Prefer max-width with width:100%.', autoFix);

  const animated = all.filter(el => {
    const style = getComputedStyle(el);
    const hasAnimation = style.animationName && style.animationName !== 'none';
    const hasTransition = style.transition && style.transition !== 'none' && style.transition !== 'all 0s ease 0s';
    return (hasAnimation || hasTransition) && (!style.willChange || style.willChange === 'auto');
  });
  if (autoFix && animated.length > 0) {
    ensureStyle('oct-reduced-motion', '@media (prefers-reduced-motion: reduce){[data-oct-animated]{animation:none!important;transition:none!important}}');
    animated.forEach(el => {
      el.style.willChange = 'transform';
      el.setAttribute('data-oct-animated', '');
    });
  }
  record(issues, passed, 'ANIMATION_PERF', 'minor', animated, 'Animated elements missing will-change/reduced-motion handling.', 'Add will-change for compositor animation and prefers-reduced-motion fallback.', autoFix);

  const heavyAnimation = all.filter(el => {
    const transition = getStyle(el, 'transition');
    return transition && transition !== 'none' && ['top', 'left', 'right', 'bottom', 'margin', 'padding', 'width', 'height'].some(prop => transition.includes(prop));
  });
  record(issues, passed, 'HEAVY_ANIMATION', 'major', heavyAnimation, 'Transition on expensive layout properties.', 'Use transform and opacity for smooth animations.', false);

  const imagesMissingDimensions = queryAuditElements('img').filter(img => !img.hasAttribute('width') || !img.hasAttribute('height'));
  if (autoFix) imagesMissingDimensions.forEach(img => {
    if (img.naturalWidth) {
      img.setAttribute('width', img.naturalWidth);
      img.setAttribute('height', img.naturalHeight);
    }
  });
  record(issues, passed, 'IMAGE_MISSING_DIMENSIONS', 'minor', imagesMissingDimensions, 'Images without width/height may cause layout shift.', 'Set intrinsic width and height.', autoFix);

  const missingAlt = queryAuditElements('img').filter(img => !img.hasAttribute('alt') && !img.hasAttribute('role'));
  if (autoFix) missingAlt.forEach(img => {
    const name = (img.src || '').split('/').pop()?.replace(/\.\w+$/, '').replace(/[-_]/g, ' ') || '';
    img.setAttribute('alt', name);
  });
  record(issues, passed, 'MISSING_ALT_TEXT', 'critical', missingAlt, 'Images without alt text.', 'Add descriptive alt text or role=presentation.', autoFix);

  const missingAria = queryAuditElements('button, [role="button"]').filter(button => {
    return button.textContent.trim().length === 0 && !button.hasAttribute('aria-label') && !button.hasAttribute('aria-labelledby') && !button.hasAttribute('title');
  });
  if (autoFix) missingAria.forEach(button => button.setAttribute('aria-label', button.title || 'action'));
  record(issues, passed, 'MISSING_ARIA_LABEL', 'minor', missingAria, 'Icon-only buttons without accessible labels.', 'Add aria-label or visible text.', autoFix);

  const formMissingLabels = queryAuditElements('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').filter(input => {
    const hasLabel = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const wrappedByLabel = !!input.closest('label');
    return !hasLabel && !wrappedByLabel && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby');
  });
  if (autoFix) formMissingLabels.forEach((input, index) => {
    if (!input.id) input.id = `oct-label-${index}`;
    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.textContent = input.placeholder || input.name || input.type || 'Field';
    label.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
    input.parentNode?.insertBefore(label, input);
  });
  record(issues, passed, 'FORM_MISSING_LABEL', 'critical', formMissingLabels, 'Form controls without associated labels.', 'Add label, aria-label, or aria-labelledby.', autoFix);

  const tinyText = all.filter(el => {
    const size = Number.parseFloat(getStyle(el, 'font-size'));
    return size > 0 && size < 12 && el.textContent.trim().length > 0 && isVisible(el) && !isUiChromeText(el);
  });
  if (autoFix) tinyText.forEach(el => { el.style.fontSize = '12px'; });
  record(issues, passed, 'FONT_SIZE_TOO_SMALL', 'minor', tinyText, 'Text smaller than 12px.', 'Use at least 12px for readable UI text.', autoFix);

  const lineHeight = queryAuditElements('p, li, td, dd').filter(el => {
    const lh = Number.parseFloat(getStyle(el, 'line-height'));
    const fs = Number.parseFloat(getStyle(el, 'font-size'));
    return fs > 0 && lh / fs < 1.4;
  });
  if (autoFix) {
    ensureStyle('oct-line-height', '[data-oct-lh]{line-height:1.6!important}');
    lineHeight.forEach(el => el.setAttribute('data-oct-lh', ''));
  }
  record(issues, passed, 'MISSING_LINE_HEIGHT', 'minor', lineHeight, 'Line-height below 1.4.', 'Set line-height around 1.5-1.6 for readable text.', autoFix);

  const hardcodedColors = queryAuditElements('[style]').filter(el => {
    const style = el.getAttribute('style') || '';
    return /(color|background)\s*:\s*#[0-9a-f]{3,8}/i.test(style);
  });
  record(issues, passed, 'COLOR_NOT_SEMANTIC', 'minor', hardcodedColors, 'Hardcoded colors in inline styles.', 'Move repeated colors into theme tokens or CSS variables.', false);

  const contrastIssues = queryAuditElements('p, span, h1, h2, h3, h4, li, td, th, label, a, button').filter(el => {
    if (!el.textContent.trim()) return false;
    if (!isVisible(el) || isUiChromeText(el)) return false;
    const fg = parseRgb(getStyle(el, 'color'));
    const bg = getEffectiveBackground(el);
    if (!fg || !bg) return false;
    const fontSize = Number.parseFloat(getStyle(el, 'font-size'));
    const minimum = fontSize >= 18 ? 3 : 4.5;
    return contrastRatio(fg, bg) < minimum;
  });
  record(issues, passed, 'LOW_COLOR_CONTRAST', 'major', contrastIssues, 'Text may fail WCAG contrast.', 'Increase foreground/background contrast.', false);

  const responsiveOverflow = all.filter(el => el.scrollWidth > document.documentElement.clientWidth + 5);
  if (autoFix) responsiveOverflow.forEach(el => { el.style.maxWidth = '100%'; el.style.overflowX = 'hidden'; });
  record(issues, passed, 'RESPONSIVE_OVERFLOW', 'major', responsiveOverflow, 'Element wider than viewport.', 'Clamp width or revise layout constraints.', autoFix);

  const formsMissingValidation = queryAuditElements('form').filter(form => {
    return form.querySelectorAll('input[required], select[required], textarea[required]').length > 0 &&
      !form.querySelector('[role="alert"], .error, .invalid-feedback');
  });
  record(issues, passed, 'FORM_MISSING_VALIDATION', 'major', formsMissingValidation, 'Required fields without visible error containers.', 'Add error message container with role=alert.', false);

  const autocomplete = queryAuditElements('input').filter(input => {
    if (input.getAttribute('autocomplete') === 'off') return false;
    return !input.hasAttribute('autocomplete') && ['email', 'password', 'tel', 'text', 'search', 'url'].includes(input.type);
  });
  if (autoFix) autocomplete.forEach(input => input.setAttribute('autocomplete', input.type === 'password' ? 'current-password' : input.type === 'search' ? 'off' : input.type));
  record(issues, passed, 'FORM_AUTOCOMPLETE', 'minor', autocomplete, 'Inputs missing autocomplete.', 'Add suitable autocomplete values.', autoFix);

  return {
    results: [...passed, ...issues],
    passed,
    issues,
    stats: {
      total: passed.length + issues.length,
      passed: passed.length,
      issues: issues.length,
      fixed: issues.filter(issue => issue.autoFixed).length,
      critical: issues.filter(issue => issue.severity === 'critical').length,
      major: issues.filter(issue => issue.severity === 'major').length,
      minor: issues.filter(issue => issue.severity === 'minor').length,
    },
  };
}
