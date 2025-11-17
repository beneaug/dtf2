// Endpoint to update order with shipping address after checkout completes
// Called from the success page or can be used to manually update orders
const { Pool } = require("pg");
const Stripe = require("stripe");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const stripe =
  process.env.STRIPE_SECRET_KEY &&
  Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

module.exports = async (req, res) => {
  // Allow both GET (from success page) and POST
  let sessionId;
  if (req.method === "GET") {
    sessionId = req.query.session_id || req.query.sessionId;
  } else if (req.method === "POST") {
    const body = await readJsonBody(req);
    sessionId = body?.sessionId || body?.session_id;
  } else {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use GET or POST." }));
  }

  if (!sessionId) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "session_id or sessionId is required" }));
  }

  console.log("Updating shipping address for session:", sessionId);

  try {
    // Retrieve full session from Stripe
    const fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details", "shipping_details"],
    });

    console.log("Retrieved session:", {
      id: fullSession.id,
      payment_status: fullSession.payment_status,
      shipping_details: fullSession.shipping_details ? "present" : "null",
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
      console.log("Extracted shipping address:", shippingAddress);
    } else {
      console.log("No shipping address in session");
    }

    // Update database
    const client = await pool.connect();
    try {
      if (shippingAddress) {
        const result = await client.query(
          `UPDATE dtf_orders 
           SET shipping_address = $1 
           WHERE stripe_session_id = $2 
           RETURNING id`,
          [JSON.stringify(shippingAddress), sessionId]
        );

        if (result.rowCount > 0) {
          console.log("Successfully updated order with shipping address");
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              ok: true,
              message: "Shipping address updated",
              shippingAddress,
            })
          );
        } else {
          console.log("No order found for session:", sessionId);
          res.statusCode = 404;
          return res.end(
            JSON.stringify({
              error: "Order not found for this session",
              sessionId,
            })
          );
        }
      } else {
        console.log("No shipping address to update");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            ok: true,
            message: "No shipping address found in session",
          })
        );
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error updating shipping address:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Failed to update shipping address",
        message: err.message,
      })
    );
  }
};

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

