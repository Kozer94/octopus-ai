function sendError(res, error) {
  res.status(error.statusCode || 500).json({ success: false, error: error.message });
}

function registerShimRoutes(app, { shimPolyfills }) {
  app.post('/api/shim/repair', async (req, res) => {
    try {
      const result = await shimPolyfills.repairCompatibilityGap(req.body);
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });
}

module.exports = { registerShimRoutes };
