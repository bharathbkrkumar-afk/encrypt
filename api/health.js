module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'healthy',
    uptime_timestamp: Date.now() / 1000,
    runtime: 'Vercel Serverless (Node.js)',
  });
};
