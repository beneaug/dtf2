const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
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

async function handleGet(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         id,
         created_at,
         mode,
         size,
         quantity,
         transfer_name,
         garment_color,
         notes,
         files,
         status,
         unit_price_cents,
         total_price_cents,
         stripe_session_id
       FROM dtf_orders
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        orders: result.rows,
      })
    );
  } finally {
    client.release();
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handlePatch(req, res) {
  const body = await readJsonBody(req);
  const { orderId, status } = body || {};

  if (!orderId || !status) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({ error: "orderId and status are required." })
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "UPDATE dtf_orders SET status = $1 WHERE id = $2 RETURNING id, status",
      [status, orderId]
    );

    if (result.rowCount === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Order not found." }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, order: result.rows[0] }));
  } finally {
    client.release();
  }
}

module.exports = async (req, res) => {
  if (!requireOperatorAuth(req, res)) return;

  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "PATCH") {
    return handlePatch(req, res);
  }

  res.statusCode = 405;
  res.setHeader("Allow", "GET, PATCH");
  res.end(JSON.stringify({ error: "Method not allowed." }));
};


