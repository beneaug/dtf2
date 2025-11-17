// Simple test endpoint to verify webhook is reachable
module.exports = (req, res) => {
  console.log("TEST WEBHOOK ENDPOINT CALLED");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ 
    ok: true, 
    message: "Webhook endpoint is reachable",
    timestamp: new Date().toISOString()
  }));
};

