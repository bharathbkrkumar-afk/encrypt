export default function handler(req, res) {
  const data = {
    status: 'healthy',
    uptime_timestamp: Date.now() / 1000,
    runtime: 'Vercel Serverless (Node.js)',
  };

  if (res && typeof res.status === 'function') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

