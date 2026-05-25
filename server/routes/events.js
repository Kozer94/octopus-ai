const {
  buildDeterministicReplay,
  reduceRuntimeState,
} = require('../services/runtimeReconstructionService');

function writeSse(res, event) {
  res.write(`id: ${event.id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function registerEventRoutes(app, { eventBus }) {
  app.get('/api/events', (req, res) => {
    try {
      const { category = '', sessionId = '', severity = '', sinceId = '', taskId = '', traceId = '', type = '', limit = '100' } = req.query;
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
      const events = eventBus.getRecent({
        category: category || undefined,
        sessionId: sessionId || undefined,
        severity: severity || undefined,
        type: type || undefined,
        taskId: taskId || undefined,
        traceId: traceId || undefined,
        sinceId: sinceId || undefined,
        limit: safeLimit,
      });
      res.json({
        success: true,
        events,
        meta: {
          count: events.length,
          limit: safeLimit,
          truncated: events.length === safeLimit,
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/events/publish', (req, res) => {
    try {
      const { type, payload = {}, metadata = {}, meta = {} } = req.body;
      const event = eventBus.publish(type, payload, {
        ...metadata,
        ...meta,
        source: metadata.source || meta.source || 'api',
      });
      res.json({ success: true, event });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/events/stream', (req, res) => {
    try {
      const { category = '', sessionId = '', severity = '', sinceId = '', taskId = '', traceId = '', type = '', replay = '1', limit = '100' } = req.query;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      req.setTimeout(0);
      res.setTimeout(0);
      res.flushHeaders?.();

      const unsubscribe = eventBus.subscribe(
        event => writeSse(res, event),
        {
          type: type || undefined,
          category: category || undefined,
          sessionId: sessionId || undefined,
          severity: severity || undefined,
          sinceId: sinceId || undefined,
          taskId: taskId || undefined,
          traceId: traceId || undefined,
          replay: replay !== '0',
          limit: Math.min(Math.max(Number(limit) || 100, 1), 250),
        },
      );

      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { }
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/events/reconstruct/runtime', (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 1000);
      res.json({
        success: true,
        state: reduceRuntimeState(eventBus.getEventLog({ limit })),
        meta: { limit },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/events/replay/:traceId', (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 1000);
      res.json({
        success: true,
        replay: buildDeterministicReplay(eventBus.getEventLog({ traceId: req.params.traceId, limit }), {
          traceId: req.params.traceId,
        }),
        meta: { limit },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerEventRoutes, writeSse };
