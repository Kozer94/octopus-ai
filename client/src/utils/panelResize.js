export function clampPanelWidth(width, { minWidth, maxWidth }) {
  const resolvedMax = typeof maxWidth === 'function' ? maxWidth() : maxWidth;
  const safeMax = Math.max(minWidth, resolvedMax);
  return Math.max(minWidth, Math.min(safeMax, width));
}

export function getViewportBoundedPanelMax({
  otherPanelOpen = false,
  otherPanelWidth = 0,
  maxWidth,
  minEditorWidth = 300,
  reservedWidth = 86,
  viewportWidth = globalThis.innerWidth || 1024,
}) {
  const otherWidth = otherPanelOpen ? otherPanelWidth : 0;
  return Math.max(0, Math.min(maxWidth, viewportWidth - otherWidth - minEditorWidth - reservedWidth));
}

export function startHorizontalResize(event, { currentWidth, setWidth, minWidth, maxWidth, otherPanelOpen = false, otherPanelWidth = 0 }) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = currentWidth;

  const onMove = moveEvent => {
    const resolvedMax = typeof maxWidth === 'function' ? maxWidth() : maxWidth;
    const viewportMax = getViewportBoundedPanelMax({ otherPanelOpen, otherPanelWidth, maxWidth: resolvedMax, minEditorWidth: 300, reservedWidth: 86 });
    const effectiveMax = Math.min(resolvedMax, viewportMax);
    setWidth(clampPanelWidth(startWidth + moveEvent.clientX - startX, { minWidth, maxWidth: effectiveMax }));
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function startVerticalResize(event, { currentHeight, setHeight, minHeight, maxHeight }) {
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = currentHeight;
  const TITLE_BAR = 36;
  const STATUS_BAR = 22;
  const MIN_EDITOR_HEIGHT = 200;

  const onMove = moveEvent => {
    const viewportHeight = window.innerHeight;
    const maxAllowed = Math.max(minHeight, viewportHeight - TITLE_BAR - STATUS_BAR - MIN_EDITOR_HEIGHT);
    const effectiveMax = Math.min(maxHeight, maxAllowed);
    setHeight(Math.max(minHeight, Math.min(effectiveMax, startHeight - (moveEvent.clientY - startY))));
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
