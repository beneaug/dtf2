const { Pool } = require("pg");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function getSessionTokenFromCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = header.split(";").map((c) => c.trim());
  for (const part of parts) {
    if (part.startsWith("op_session=")) {
      return decodeURIComponent(part.split("=")[1] || "");
    }
  }
  return null;
}

function requireOperatorAuth(req, res) {
  const expectedSession = process.env.OPERATOR_SESSION_TOKEN;
  if (!expectedSession) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "OPERATOR_SESSION_TOKEN not configured. Set it in your environment.",
      })
    );
    return false;
  }
  const cookieToken = getSessionTokenFromCookie(req);
  if (cookieToken !== expectedSession) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  if (!requireOperatorAuth(req, res)) return;

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "Method not allowed." }));
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const orderId = Number(url.searchParams.get("orderId"));
  const index = Number(url.searchParams.get("index") || "0");

  if (!orderId || index < 0) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({ error: "orderId (number) is required." })
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT files FROM dtf_orders WHERE id = $1",
      [orderId]
    );
    if (result.rowCount === 0) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Order not found." }));
    }

    const files = Array.isArray(result.rows[0].files)
      ? result.rows[0].files
      : [];
    if (!files.length || !files[index]) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "No files for this order." }));
    }

    const file = files[index];
    const key = file.key;
    if (!key) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing S3 key for file." }));
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, url: signedUrl }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Failed to generate file URL. Check server logs.",
      })
    );
  } finally {
    client.release();
  }
};


