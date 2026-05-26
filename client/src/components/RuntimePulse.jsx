
import { useEffect, useRef } from 'react';

const PULSE_COLORS = {
  idle: '#30363d',
  working: '#f0883e',
  success: '#2ea043',
  error: '#da3633',
  waiting: '#58a6ff',
};

export function RuntimePulseNode({ status = 'idle', size = 32, label }) {
  const color = PULSE_COLORS[status] || PULSE_COLORS.idle;
  const isActive = status === 'working' || status === 'waiting';

  return (
    <div
      className={`runtime-node ${isActive ? 'active' : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isActive ? color + '22' : 'transparent',
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: 'all 0.3s ease',
      }}
      title={label || status}
    >
      {isActive && (
        <div
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderRadius: '50%',
            background: color,
            animation: status === 'working' ? 'runtimePulseCore 1.5s ease-in-out infinite' : 'runtimeBreathe 2s ease-in-out infinite',
          }}
        />
      )}
      {status === 'success' && (
        <i className="codicon codicon-check" style={{ color, fontSize: size * 0.4 }} />
      )}
      {status === 'error' && (
        <i className="codicon codicon-close" style={{ color, fontSize: size * 0.4 }} />
      )}
      {status === 'idle' && (
        <div style={{
          width: size * 0.25,
          height: size * 0.25,
          borderRadius: '50%',
          background: color,
          opacity: 0.4,
        }} />
      )}
    </div>
  );
}

export function RuntimeTraceLine({ active = false, direction = 'horizontal', length = 60 }) {
  return (
    <svg
      width={direction === 'horizontal' ? length : 2}
      height={direction === 'vertical' ? length : 2}
      style={{ overflow: 'visible' }}
    >
      <line
        className={`trace-line ${active ? 'active' : ''}`}
        x1={0}
        y1={direction === 'horizontal' ? 1 : 0}
        x2={direction === 'horizontal' ? length : 0}
        y2={direction === 'vertical' ? length : 1}
        stroke={active ? 'rgba(240,136,62,0.5)' : 'rgba(48,54,61,0.6)'}
        strokeWidth={active ? 1.5 : 1}
        strokeDasharray={active ? '4 3' : '2 4'}
      />
    </svg>
  );
}

export function RuntimeTopologyGraph({ legs = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radius = Math.min(centerX, centerY) - 30;
    const workingLegs = legs.filter(l => l.status === 'working');
    const anyWorking = workingLegs.length > 0;

    // Draw connection lines
    legs.forEach((leg, i) => {
      const angle = (i / legs.length) * Math.PI * 2 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const isActive = leg.status === 'working' || leg.status === 'waiting';

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = isActive ? 'rgba(240,136,62,0.25)' : 'rgba(48,54,61,0.3)';
      ctx.lineWidth = isActive ? 1.5 : 0.5;
      if (isActive) {
        ctx.setLineDash([4, 3]);
      } else {
        ctx.setLineDash([2, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw node
      const nodeRadius = isActive ? 8 : 5;
      const nodeColor = PULSE_COLORS[leg.status] || PULSE_COLORS.idle;

      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? nodeColor + '33' : 'transparent';
      ctx.fill();
      ctx.strokeStyle = nodeColor;
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();

      if (isActive) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
      }

      // Label
      ctx.font = '9px Inter, Segoe UI, sans-serif';
      ctx.fillStyle = isActive ? '#e6edf3' : '#9aa4ad';
      ctx.textAlign = 'center';
      const labelY = y > centerY ? y + 18 : y - 12;
      ctx.fillText(leg.name.replace(' Leg', ''), x, labelY);
    });

    // Draw center hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
    ctx.fillStyle = anyWorking ? 'rgba(240,136,62,0.15)' : 'rgba(88,166,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = anyWorking ? '#f0883e' : '#30363d';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐙', centerX, centerY);

  }, [legs]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}

export function RuntimeStatusBar({ legs = [], loading }) {
  const workingCount = legs.filter(l => l.status === 'working').length;
  const successCount = legs.filter(l => l.status === 'success' || l.status === 'done').length;
  const errorCount = legs.filter(l => l.status === 'error').length;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '2px 0',
    }}>
      {loading && (
        <div
          className="status-runtime-indicator"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: workingCount > 0 ? '#f0883e' : '#58a6ff',
            boxShadow: `0 0 6px ${workingCount > 0 ? '#f0883e' : '#58a6ff'}`,
          }}
        />
      )}
      {workingCount > 0 && (
        <span style={{ fontSize: 10, color: '#f0883e', fontWeight: 500 }}>
          {workingCount} active
        </span>
      )}
      {successCount > 0 && (
        <span style={{ fontSize: 10, color: '#2ea043' }}>
          {successCount} ✓
        </span>
      )}
      {errorCount > 0 && (
        <span style={{ fontSize: 10, color: '#da3633' }}>
          {errorCount} ✗
        </span>
      )}
    </div>
  );
}
