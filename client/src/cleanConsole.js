(function () {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalInfo = console.info;

  console.warn = function (...args) {
    const msg = args.join(' ');
    if (msg.includes('Electron Security Warning') || msg.includes('Content Security Policy')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  function _devToolsMsg(args) {
    return args.join(' ').includes('Download the React DevTools');
  }

  console.log = function (...args) {
    if (_devToolsMsg(args)) return;
    originalLog.apply(console, args);
  };

  console.info = function (...args) {
    if (_devToolsMsg(args)) return;
    originalInfo.apply(console, args);
  };
})();
