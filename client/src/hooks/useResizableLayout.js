import { useCallback, useEffect, useState } from 'react';
import { clampPanelWidth, getViewportBoundedPanelMax, startHorizontalResize, startVerticalResize } from '../utils/panelResize';

const MIN_EDITOR_WIDTH = 300;
const RESERVED_LAYOUT_WIDTH = 86;
const RESPONSIVE_BREAKPOINT = 1024;

export function useResizableLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [terminalHeight, setTerminalHeight] = useState(180);
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeActivity, setActiveActivity] = useState('explorer');
  const [rightPanelTab, setRightPanelTab] = useState('chat');
  const [isMobile, setIsMobile] = useState(false);

  const getSidebarMaxWidth = useCallback(() => {
    return getViewportBoundedPanelMax({
      maxWidth: 350,
      minEditorWidth: MIN_EDITOR_WIDTH,
      otherPanelOpen: rightPanelOpen,
      otherPanelWidth: rightPanelWidth,
      reservedWidth: RESERVED_LAYOUT_WIDTH,
    });
  }, [rightPanelOpen, rightPanelWidth]);

  const getRightPanelMaxWidth = useCallback(() => {
    return getViewportBoundedPanelMax({
      maxWidth: 520,
      minEditorWidth: MIN_EDITOR_WIDTH,
      otherPanelOpen: sidebarOpen,
      otherPanelWidth: sidebarWidth,
      reservedWidth: RESERVED_LAYOUT_WIDTH,
    });
  }, [sidebarOpen, sidebarWidth]);

  useEffect(() => {
    function checkMobile() {
      const mobile = window.innerWidth < RESPONSIVE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setRightPanelOpen(false);
      }
    }

    function clampLayoutToViewport() {
      setSidebarWidth(width => clampPanelWidth(width, { minWidth: 150, maxWidth: getSidebarMaxWidth() }));
      setRightPanelWidth(width => clampPanelWidth(width, { minWidth: 220, maxWidth: getRightPanelMaxWidth() }));
    }

    checkMobile();
    clampLayoutToViewport();
    window.addEventListener('resize', () => {
      checkMobile();
      clampLayoutToViewport();
    });
    return () => window.removeEventListener('resize', clampLayoutToViewport);
  }, [getRightPanelMaxWidth, getSidebarMaxWidth]);

  function startSidebarResize(e) {
    startHorizontalResize(e, {
      currentWidth: sidebarWidth,
      maxWidth: getSidebarMaxWidth,
      minWidth: 150,
      setWidth: setSidebarWidth,
      otherPanelOpen: rightPanelOpen,
      otherPanelWidth: rightPanelWidth,
    });
  }

  function startTerminalResize(e) {
    startVerticalResize(e, {
      currentHeight: terminalHeight,
      maxHeight: 400,
      minHeight: 80,
      setHeight: setTerminalHeight,
    });
  }

  function startRightPanelResize(e) {
    startHorizontalResize(e, {
      currentWidth: rightPanelWidth,
      maxWidth: getRightPanelMaxWidth,
      minWidth: 220,
      setWidth: setRightPanelWidth,
      otherPanelOpen: sidebarOpen,
      otherPanelWidth: sidebarWidth,
    });
  }

  function resetLayout() {
    setSidebarOpen(true);
    setRightPanelOpen(true);
    setSidebarWidth(220);
    setRightPanelWidth(260);
    setTerminalHeight(180);
    setActiveActivity('explorer');
    setRightPanelTab('chat');
  }

  return {
    activeActivity,
    isMobile,
    resetLayout,
    rightPanelOpen,
    rightPanelTab,
    rightPanelWidth,
    setActiveActivity,
    setRightPanelOpen,
    setRightPanelTab,
    setSidebarOpen,
    sidebarOpen,
    sidebarWidth,
    startRightPanelResize,
    startSidebarResize,
    startTerminalResize,
    terminalHeight,
  };
}
