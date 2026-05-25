const os = require('os');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');
const { resolveWorkingDirectory, buildSafeEnv } = require('./terminalService');

function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'powershell.exe';
  }

  return process.env.SHELL || 'bash';
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function registerPtyTerminalServer(server) {
  const wss = new WebSocketServer({ server, path: '/api/terminal/pty' });

  wss.on('connection', (socket) => {
    let ptyProcess = null;

    function send(payload) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }

    function dispose() {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
    }

    socket.on('message', (rawMessage) => {
      const message = parseJson(rawMessage.toString());

      if (message.type === 'start') {
        dispose();
        const cwd = resolveWorkingDirectory(message.cwd || os.homedir(), os.homedir());
        const cols = Number(message.cols) || 80;
        const rows = Number(message.rows) || 24;
        const shell = message.shell || getDefaultShell();

        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: buildSafeEnv(),
        });

        ptyProcess.onData(data => send({ type: 'data', data }));
        ptyProcess.onExit(({ exitCode, signal }) => {
          send({ type: 'exit', exitCode, signal });
          ptyProcess = null;
        });

        send({ type: 'ready', shell, cwd });
        return;
      }

      if (message.type === 'input' && ptyProcess) {
        ptyProcess.write(message.data || '');
        return;
      }

      if (message.type === 'resize' && ptyProcess) {
        ptyProcess.resize(Number(message.cols) || 80, Number(message.rows) || 24);
        return;
      }

      if (message.type === 'kill') {
        dispose();
      }
    });

    socket.on('close', dispose);
    socket.on('error', dispose);
  });

  return wss;
}

module.exports = {
  getDefaultShell,
  registerPtyTerminalServer,
};
