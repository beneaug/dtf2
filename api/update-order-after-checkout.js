// Endpoint to update order with shipping address and gang sheet data after checkout completes
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
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
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
    const { sessionId, gangSheetData } = body || {};

    if (!sessionId) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({ error: "sessionId is required in request body" })
      );
    }

    console.log("Updating order after checkout for session:", sessionId);
    console.log("Has gang sheet data:", !!gangSheetData);

    // Retrieve full session from Stripe
    const fullSession = await stripe.checkout.sessions.retrieve(sessionId);

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
    }

    if (!pool) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({ error: "Database not available." })
      );
    }

    const client = await pool.connect();
    try {
      // Find order by session ID
      const findResult = await client.query(
        `SELECT id, gang_sheet_data FROM dtf_orders WHERE stripe_session_id = $1`,
        [sessionId]
      );

      if (findResult.rows.length === 0) {
        console.error("Order not found for session:", sessionId);
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Order not found." }));
      }

      const order = findResult.rows[0];
      console.log("Found order:", order.id);
      console.log("Current gang_sheet_data:", order.gang_sheet_data ? "EXISTS" : "NULL");

      // Build update query
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (shippingAddress) {
        updates.push(`shipping_address = $${paramIndex}`);
        values.push(JSON.stringify(shippingAddress));
        paramIndex++;
      }

      if (gangSheetData) {
        updates.push(`gang_sheet_data = $${paramIndex}::jsonb`);
        values.push(gangSheetData);
        paramIndex++;
      }

      if (updates.length === 0) {
        // Nothing to update
        return res.end(JSON.stringify({ 
          ok: true, 
          message: "No updates needed",
          gangSheetDataSaved: false,
        }));
      }

      values.push(order.id);
      const updateQuery = `
        UPDATE dtf_orders
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING id, gang_sheet_data, shipping_address
      `;

      const updateResult = await client.query(updateQuery, values);

      if (updateResult.rows.length > 0) {
        const updated = updateResult.rows[0];
        const gangSheetDataSaved = !!updated.gang_sheet_data;
        
        console.log("✓ Order updated successfully");
        console.log("  Gang sheet data saved:", gangSheetDataSaved ? "YES" : "NO");
        console.log("  Shipping address saved:", !!updated.shipping_address);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({
          ok: true,
          gangSheetDataSaved,
          shippingAddress: updated.shipping_address ? JSON.parse(updated.shipping_address) : null,
        }));
      } else {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "Update failed." }));
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error updating order:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Failed to update order. Check server logs.",
      })
    );
  }
};

