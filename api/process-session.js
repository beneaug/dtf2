// Manual endpoint to process a Stripe session and extract shipping address
// Usage: POST /api/process-session with { "sessionId": "cs_test_..." }

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
    const { sessionId } = body || {};

    if (!sessionId) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({ error: "sessionId is required in request body" })
      );
    }

    console.log("Processing session manually:", sessionId);

    // Retrieve full session
    const fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details", "shipping_details"],
    });

    console.log("Session retrieved:", {
      id: fullSession.id,
      shipping_address_collection: fullSession.shipping_address_collection,
      shipping_details: fullSession.shipping_details,
      customer_details: fullSession.customer_details,
    });

    let shippingAddress = null;
    if (fullSession.shipping_details && fullSession.shipping_details.address) {
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
      console.log("Shipping address found:", shippingAddress);
    } else {
      console.log("No shipping address in session");
    }

    // Update database if shipping address found
    if (shippingAddress) {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE dtf_orders 
           SET shipping_address = $1 
           WHERE stripe_session_id = $2 
           RETURNING id, shipping_address`,
          [JSON.stringify(shippingAddress), sessionId]
        );

        if (result.rowCount > 0) {
          console.log("Updated order:", result.rows[0]);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              ok: true,
              message: "Shipping address updated",
              shippingAddress,
              order: result.rows[0],
            })
          );
        } else {
          res.statusCode = 404;
          return res.end(
            JSON.stringify({
              error: "Order not found for this session",
              sessionId,
            })
          );
        }
      } finally {
        client.release();
      }
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          ok: true,
          message: "No shipping address found in session",
          session: {
            id: fullSession.id,
            shipping_address_collection: fullSession.shipping_address_collection,
            shipping_details: fullSession.shipping_details,
          },
        })
      );
    }
  } catch (err) {
    console.error("Error processing session:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Failed to process session",
        message: err.message,
      })
    );
  }
};

