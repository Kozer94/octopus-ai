export function flattenVisibleFileTree(items = [], expandedPaths = new Set(), { maxRows = 5000 } = {}) {
  const rows = [];

  function visit(nodes, level) {
    for (const item of nodes) {
      if (rows.length >= maxRows) return;
      const isDir = item.type === 'dir';
      const isOpen = isDir && expandedPaths.has(item.path);
      rows.push({ item, level, isDir, isOpen });

      if (isOpen && Array.isArray(item.children)) {
        visit(item.children, level + 1);
      }
    }
  }

  visit(items, 0);
  return rows;
}

export function getVirtualWindow({ rowCount, rowHeight, scrollTop, viewportHeight, overscan = 8 }) {
  if (rowCount <= 0) return { start: 0, end: 0, offsetY: 0 };

  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rowCount, start + visibleCount + overscan * 2);

  return {
    start,
    end,
    offsetY: start * rowHeight,
  };
}
