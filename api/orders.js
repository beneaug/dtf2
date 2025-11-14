// Sample Vercel / Node serverless function for handling DTF orders.
// This is intentionally minimal and does NOT persist files or data yet.
// Plug it into your own storage / database layer.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(
      JSON.stringify({ error: "Method not allowed. Use POST instead." })
    );
  }

  // NOTE: In a real implementation you would parse the multipart/form-data
  // payload here using a library such as `busboy`, `formidable`, or `multer`,
  // validate file types / sizes, and stream artwork to object storage.
  //
  // For this stub we simply acknowledge receipt without inspecting the body.

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(
    JSON.stringify({
      ok: true,
      message:
        "DTF order payload accepted by demo endpoint. Wire this into your real backend to store files and order metadata.",
    })
  );
};


