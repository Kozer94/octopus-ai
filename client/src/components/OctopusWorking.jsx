import { TypingCode } from './TypingCode';

export function OctopusWorking({ active, legs }) {
  const workingLegs = legs.filter(l => l.status === 'working');
  if (!active || workingLegs.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <style>{`
          @keyframes octopusBob {
            0%, 100% { transform: translateY(0px) rotate(-3deg); }
            50% { transform: translateY(-8px) rotate(3deg); }
          }
          @keyframes tentacle1 {
            0%, 100% { transform: rotate(-20deg); }
            50% { transform: rotate(20deg); }
          }
          @keyframes tentacle2 {
            0%, 100% { transform: rotate(20deg); }
            50% { transform: rotate(-20deg); }
          }
          @keyframes octopusBlink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
          @keyframes octopusTyping {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>

        <svg width="120" height="120" viewBox="0 0 120 120" style={{ animation: 'octopusBob 1.2s ease-in-out infinite' }}>
          <ellipse cx="60" cy="45" rx="32" ry="28" fill="#ff6b2b" />
          <ellipse cx="60" cy="34" rx="28" ry="24" fill="#ff8c42" />
          <ellipse cx="60" cy="42" rx="20" ry="14" fill="#e85520" opacity="0.4" />
          <g style={{ animation: 'octopusBlink 3s infinite', transformOrigin: '60px 30px' }}>
            <circle cx="49" cy="30" r="7" fill="white" />
            <circle cx="71" cy="30" r="7" fill="white" />
            <circle cx="50.5" cy="31.5" r="4.5" fill="#1a0a00" />
            <circle cx="72.5" cy="31.5" r="4.5" fill="#1a0a00" />
            <circle cx="51.5" cy="30" r="1.5" fill="white" />
            <circle cx="73.5" cy="30" r="1.5" fill="white" />
          </g>
          <path d="M50 42 Q60 49 70 42" stroke="#c23d0a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="45" cy="50" r="3" fill="#ff4500" opacity="0.6" />
          <circle cx="60" cy="55" r="3" fill="#ff4500" opacity="0.6" />
          <circle cx="75" cy="50" r="3" fill="#ff4500" opacity="0.6" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const x = 24 + i * 10.5;
            const delay = i * 0.15;
            const curve = i % 2 === 0 ? -6 : 6;
            return (
              <g key={i} style={{ transformOrigin: `${x}px 65px`, animation: `${i % 2 === 0 ? 'tentacle1' : 'tentacle2'} ${0.7 + i * 0.08}s ease-in-out infinite`, animationDelay: `${delay}s` }}>
                <path d={`M${x} 65 Q${x + curve} 82 ${x + curve * 0.5} 100`} stroke="#ff6b2b" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
                <path d={`M${x} 65 Q${x + curve} 82 ${x + curve * 0.5} 100`} stroke="#ff8c42" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{
        background: '#0d1117', border: '0.5px solid #30363d',
        borderRadius: 10, padding: '10px 16px', maxWidth: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f0883e', animation: 'octopusTyping 0.8s infinite' }} />
          <span style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 500 }}>Octopus working...</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {workingLegs.map((leg, i) => (
            <div key={leg.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f0883e', animation: `octopusTyping ${0.6 + i * 0.2}s infinite`, animationDelay: `${i * 0.1}s`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#8b949e' }}>{leg.name}:</span>
              <span style={{ fontSize: 11, color: '#c9d1d9', fontFamily: 'monospace' }}>{leg.task}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, padding: '6px 8px', background: '#161b22', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: '#7ee787' }}>
          <TypingCode />
        </div>
      </div>
    </div>
  );
}
