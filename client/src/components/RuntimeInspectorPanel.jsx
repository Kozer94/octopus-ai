function statusColor(status, t) {
  if (status === 'COMPLETED') return '#3fb950';
  if (status === 'FAILED') return '#f85149';
  if (status === 'RUNNING' || status === 'VALIDATING') return '#f0883e';
  if (status === 'RETRYING' || status === 'WAITING_DEPENDENCY') return '#d29922';
  if (status === 'CANCELLED') return '#8b949e';
  return t.textMuted;
}

function Metric({ label, value, t }) {
  return (
    <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', minWidth: 0 }}>
      <p style={{ fontSize: 9, color: t.textMuted, margin: '0 0 4px', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: 13, color: t.text, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function spanStatusColor(span, t) {
  if (span.status === 'error') return '#f85149';
  if (span.status === 'timeout') return '#d29922';
  if ((span.durationMs || 0) >= 1000) return '#f0883e';
  if (span.status === 'ok') return '#3fb950';
  return t.textMuted;
}

function compactTraceId(traceId = '') {
  if (!traceId) return 'no trace';
  return traceId.length > 18 ? `${traceId.slice(0, 8)}...${traceId.slice(-6)}` : traceId;
}

function TraceWaterfall({ spans = [], traceId = '', t }) {
  const firstStart = spans[0]?.startedAtMs || 0;
  const lastEnd = spans.reduce((max, span) => {
    const end = (span.startedAtMs || 0) + (span.durationMs || 0);
    return Math.max(max, end);
  }, firstStart + 1);
  const totalMs = Math.max(1, Math.round(lastEnd - firstStart));
  const slowest = spans.reduce((max, span) => Math.max(max, span.durationMs || 0), 0);
  const errors = spans.filter(span => span.status === 'error' || span.status === 'timeout').length;

  return (
    <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
        <Metric label="Spans" value={spans.length} t={t} />
        <Metric label="Trace ms" value={totalMs} t={t} />
        <Metric label="Issues" value={errors} t={t} />
      </div>
      <p title={traceId} style={{ color: t.textMuted, fontSize: 10, margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {compactTraceId(traceId)}
      </p>
      {spans.length === 0 ? (
        <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>No client spans yet</p>
      ) : spans.map(span => {
        const left = Math.max(0, Math.min(96, (((span.startedAtMs || firstStart) - firstStart) / totalMs) * 100));
        const width = Math.max(2, Math.min(100 - left, ((span.durationMs || 1) / totalMs) * 100));
        const color = spanStatusColor(span, t);
        const isBottleneck = slowest > 0 && (span.durationMs || 0) === slowest;
        return (
          <div key={span.spanId} style={{ marginBottom: 7 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 54px', gap: 7, alignItems: 'center', marginBottom: 3 }}>
              <span title={span.name} style={{ color: isBottleneck ? color : t.text, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {span.name}
              </span>
              <span style={{ color, fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {span.durationMs || 0}ms
              </span>
            </div>
            <div style={{ position: 'relative', height: 8, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 1, bottom: 1, borderRadius: 4, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TreeNode({ node, t, depth = 0 }) {
  return (
    <div style={{ marginLeft: depth * 10, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(node.status, t), flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.type}</span>
        <span style={{ color: t.textMuted, fontSize: 10 }}>{node.attempts}x</span>
        <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>{node.durationMs ?? 0}ms</span>
      </div>
      <p style={{ margin: '2px 0 0 13px', color: t.textMuted, fontSize: 10 }}>{node.id}</p>
      {node.children?.map(child => <TreeNode key={child.id} node={child} t={t} depth={depth + 1} />)}
    </div>
  );
}

export function RuntimeInspectorPanel({
  controlPlane,
  graph,
  metrics,
  onRefresh,
  onSelectTask,
  selectedTask,
  replay,
  tasks,
  trace,
  traceId,
  traceSpans,
  tree,
  t,
  workers,
}) {
  const selectedGraph = graph || { nodes: [], edges: [], statusMap: {} };
  const selectedTree = tree || { roots: [] };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          title="Refresh runtime"
          onClick={onRefresh}
          style={{ width: 28, height: 26, border: `0.5px solid ${t.border}`, borderRadius: 6, background: t.bg, color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <i className="codicon codicon-refresh" style={{ fontSize: 13 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: t.text, margin: 0 }}>Runtime Inspector</p>
          <p style={{ fontSize: 10, color: t.textMuted, margin: '2px 0 0' }}>{tasks.length} task(s)</p>
        </div>
      </div>

      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
        <Metric label="Done" value={metrics?.completed || 0} t={t} />
        <Metric label="Failed" value={metrics?.failed || 0} t={t} />
        <Metric label="Retries" value={metrics?.retryCount || 0} t={t} />
        <Metric label="Avg ms" value={metrics?.averageTaskDurationMs || 0} t={t} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 10px 10px' }}>
        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Dependency Graph</p>
        <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
          {selectedGraph.nodes.length === 0 ? (
            <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>No workflow graph yet</p>
          ) : selectedGraph.nodes.map(node => (
            <div key={node.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(node.status, t) }} />
                <span style={{ fontSize: 11, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.id}</span>
                <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>{node.type}</span>
              </div>
              {selectedGraph.edges.filter(edge => edge.to === node.id).map(edge => (
                <p key={`${edge.from}-${edge.to}`} style={{ color: t.textMuted, fontSize: 10, margin: '3px 0 0 13px' }}>
                  {edge.from} {'->'} {edge.to}
                </p>
              ))}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Client Trace Waterfall</p>
        <TraceWaterfall spans={traceSpans || []} traceId={traceId} t={t} />

        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Control Plane</p>
        <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            <Metric label="Leases" value={controlPlane?.leases?.length || 0} t={t} />
            <Metric label="Queued" value={controlPlane?.queue?.length || 0} t={t} />
            <Metric label="Workers" value={Object.keys(controlPlane?.activeByWorker || {}).length} t={t} />
          </div>
          {(controlPlane?.leases || []).slice(0, 3).map(lease => (
            <p key={lease.executionId} style={{ color: t.textMuted, fontSize: 10, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lease.executionId} - {lease.workerId} - {lease.leaseTimeout}ms
            </p>
          ))}
        </div>

        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Execution Tree</p>
        <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
          {selectedTree.roots.length === 0
            ? <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>No execution tree yet</p>
            : selectedTree.roots.map(node => <TreeNode key={node.id} node={node} t={t} />)}
        </div>

        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Worker Registry</p>
        <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
          {workers.length === 0 ? (
            <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>No workers registered</p>
          ) : workers.map(worker => (
            <div key={worker.type} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: t.text, fontSize: 11 }}>{worker.type}</span>
                <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>x{worker.concurrency}</span>
              </div>
              <p style={{ color: t.textMuted, fontSize: 10, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {worker.capabilities.join(', ') || 'no capabilities'}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Tasks</p>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.7 }}>No runtime tasks</p>
        ) : tasks.map(task => (
          <button
            key={task.id}
            onClick={() => onSelectTask(task)}
            style={{ width: '100%', textAlign: 'left', background: selectedTask?.id === task.id ? t.accent + '18' : t.bg, border: `0.5px solid ${selectedTask?.id === task.id ? t.accent : t.border}`, borderRadius: 6, padding: '7px 9px', cursor: 'pointer', marginBottom: 6 }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(task.status, t), flexShrink: 0 }} />
              <span style={{ color: t.text, fontSize: 11, fontWeight: 500 }}>{task.type}</span>
              <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>{task.status}</span>
            </div>
            <p style={{ color: t.textMuted, fontSize: 10, margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.id}</p>
          </button>
        ))}

        {selectedTask && (
          <pre style={{ marginTop: 8, padding: 8, background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, color: t.textMuted, fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>
            {JSON.stringify({
              id: selectedTask.id,
              schemaVersion: selectedTask.schemaVersion,
              worker: selectedTask.worker,
              retryPolicy: selectedTask.retryPolicy,
              transitions: selectedTask.transitions,
              payload: selectedTask.payload,
              result: selectedTask.result,
              error: selectedTask.error,
            }, null, 2)}
          </pre>
        )}

        {trace && (
          <>
            <p style={{ fontSize: 10, color: t.textMuted, margin: '10px 0 6px', textTransform: 'uppercase' }}>Trace Flow</p>
            <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8 }}>
              {(trace.events || []).slice(-12).map((event, index) => (
                <div key={`${event.taskId}-${event.status}-${index}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(event.status, t), flexShrink: 0 }} />
                  <span style={{ color: t.text, fontSize: 10 }}>{event.status}</span>
                  <span style={{ color: t.textMuted, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.taskId}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {replay && (
          <>
            <p style={{ fontSize: 10, color: t.textMuted, margin: '10px 0 6px', textTransform: 'uppercase' }}>Replay Artifact</p>
            <pre style={{ padding: 8, background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, color: t.textMuted, fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto' }}>
              {JSON.stringify({ traceId: replay.traceId, mode: replay.mode, steps: replay.steps?.length || replay.events?.length || 0, lastSequence: replay.lastSequence }, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
