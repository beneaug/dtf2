// Utility endpoint to backfill shipping addresses for existing orders
// This can be called manually to update orders that were created before shipping address collection was enabled
// Usage: POST /api/backfill-shipping with { "sessionIds": ["cs_test_...", ...] } or empty body to backfill all

const { Pool } = require("pg");
const Stripe = require("stripe");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const stripe =
  process.env.STRIPE_SECRET_KEY &&
  Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
  }

  if (!stripe) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error: "Stripe is not configured. Ensure STRIPE_SECRET_KEY is set.",
      })
    );
  }

  try {
    const body = await readJsonBody(req);
    const { sessionIds } = body || {};

    const client = await pool.connect();
    try {
      let query;
      let params;

      if (sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0) {
        // Backfill specific sessions
        query = `SELECT stripe_session_id FROM dtf_orders WHERE stripe_session_id = ANY($1) AND (shipping_address IS NULL OR shipping_address = 'null'::jsonb)`;
        params = [sessionIds];
      } else {
        // Backfill all orders missing shipping addresses
        query = `SELECT stripe_session_id FROM dtf_orders WHERE (shipping_address IS NULL OR shipping_address = 'null'::jsonb) AND stripe_session_id IS NOT NULL`;
        params = [];
      }

      const result = await client.query(query, params);
      const sessionsToUpdate = result.rows.map((row) => row.stripe_session_id);

      console.log(`Found ${sessionsToUpdate.length} orders to backfill`);

      const updates = [];
      for (const sessionId of sessionsToUpdate) {
        try {
          const fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["customer_details", "shipping_details"],
          });

          let shippingAddress = null;
          if (
            fullSession.shipping_details &&
            fullSession.shipping_details.address
          ) {
            const addr = fullSession.shipping_details.address;
            shippingAddress = {
              name: fullSession.shipping_details.name || null,
              line1: addr.line1 || null,
              line2: addr.line2 || null,
              city: addr.city || null,
              state: addr.state || null,
              postal_code: addr.postal_code || null,
              country: addr.country || null,
            };
          }

          if (shippingAddress) {
            const updateResult = await client.query(
              `UPDATE dtf_orders SET shipping_address = $1 WHERE stripe_session_id = $2 RETURNING id`,
              [JSON.stringify(shippingAddress), sessionId]
            );
            updates.push({
              sessionId,
              success: true,
              orderId: updateResult.rows[0]?.id,
            });
            console.log(
              `Updated order for session ${sessionId} with shipping address`
            );
          } else {
            updates.push({
              sessionId,
              success: false,
              reason: "No shipping address in Stripe session",
            });
            console.log(
              `No shipping address found for session ${sessionId}`
            );
          }
        } catch (err) {
          console.error(`Error processing session ${sessionId}:`, err);
          updates.push({
            sessionId,
            success: false,
            reason: err.message,
          });
        }
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          ok: true,
          processed: sessionsToUpdate.length,
          updates,
        })
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Backfill error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Failed to backfill shipping addresses",
        message: err.message,
      })
    );
  }
};

