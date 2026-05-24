export function startHorizontalResize(event, { currentWidth, setWidth, minWidth, maxWidth }) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = currentWidth;

  const onMove = moveEvent => {
    setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + moveEvent.clientX - startX)));
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

  const onMove = moveEvent => {
    setHeight(Math.max(minHeight, Math.min(maxHeight, startHeight - (moveEvent.clientY - startY))));
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
