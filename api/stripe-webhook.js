const { Pool } = require("pg");
const Stripe = require("stripe");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const stripe =
  process.env.STRIPE_SECRET_KEY &&
  Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
  }

  if (!stripe || !webhookSecret) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error:
          "Stripe is not configured. Ensure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.",
      })
    );
  }

  const chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks);
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        req.headers["stripe-signature"],
        webhookSecret
      );
    } catch (err) {
      console.error("Stripe webhook signature verification failed.", err);
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid Stripe signature." }));
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const m = session.metadata || {};

      const size = m.size || null;
      const quantity = parseInt(m.quantity, 10) || 1;
      const transferName = m.transferName || null;
      const garmentColor = m.garmentColor || null;
      const notes = m.notes || null;
      const files = m.files ? JSON.parse(m.files) : [];

      const unitPriceCents =
        m.unitPriceCents != null ? parseInt(m.unitPriceCents, 10) : null;
      const totalPriceCents =
        m.totalPriceCents != null ? parseInt(m.totalPriceCents, 10) : null;

      // Extract shipping address from session
      // Always retrieve full session to ensure we have shipping details
      // Webhook events may not include shipping_details by default
      let shippingAddress = null;
      
      console.log("Processing webhook for session:", session.id);
      console.log("Session object keys:", Object.keys(session));
      console.log("Session shipping_address_collection:", session.shipping_address_collection);
      console.log("Session shipping_details (from event):", session.shipping_details);
      
      try {
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['customer_details', 'shipping_details'],
        });
        
        console.log("Retrieved full session. shipping_details:", fullSession.shipping_details);
        console.log("Full session customer_details:", fullSession.customer_details);
        
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
          console.log("✓ Shipping address retrieved from session:", JSON.stringify(shippingAddress));
        } else {
          // Also check if it's in the webhook event object
          if (session.shipping_details && session.shipping_details.address) {
            const addr = session.shipping_details.address;
            shippingAddress = {
              name: session.shipping_details.name || null,
              line1: addr.line1 || null,
              line2: addr.line2 || null,
              city: addr.city || null,
              state: addr.state || null,
              postal_code: addr.postal_code || null,
              country: addr.country || null,
            };
            console.log("✓ Shipping address found in webhook event:", JSON.stringify(shippingAddress));
          } else {
            console.log("✗ No shipping details found in session:", session.id);
            console.log("Full session shipping_details:", JSON.stringify(fullSession.shipping_details));
            console.log("Webhook session shipping_details:", JSON.stringify(session.shipping_details));
            console.log("Full session object (relevant fields):", {
              shipping_address_collection: fullSession.shipping_address_collection,
              shipping: fullSession.shipping,
              customer_details: fullSession.customer_details,
            });
          }
        }
      } catch (err) {
        console.error("Failed to retrieve full session for shipping address:", err);
        console.error("Error stack:", err.stack);
        // Fallback: check if shipping_details is in the webhook event
        if (session.shipping_details && session.shipping_details.address) {
          const addr = session.shipping_details.address;
          shippingAddress = {
            name: session.shipping_details.name || null,
            line1: addr.line1 || null,
            line2: addr.line2 || null,
            city: addr.city || null,
            state: addr.state || null,
            postal_code: addr.postal_code || null,
            country: addr.country || null,
          };
          console.log("✓ Shipping address found in webhook event (fallback):", JSON.stringify(shippingAddress));
        }
      }

      const client = await pool.connect();
      try {
        const shippingAddressJson = shippingAddress ? JSON.stringify(shippingAddress) : null;
        console.log("Attempting to insert order with shipping_address:", shippingAddressJson ? "present" : "null");
        
        const result = await client.query(
          `INSERT INTO dtf_orders
             (mode, size, quantity, transfer_name, garment_color, notes,
              files, unit_price_cents, total_price_cents, stripe_session_id, status, shipping_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
           ON CONFLICT (stripe_session_id) 
           DO UPDATE SET shipping_address = COALESCE(EXCLUDED.shipping_address, dtf_orders.shipping_address)
           RETURNING id`,
          [
            m.mode || "single-image",
            size,
            quantity,
            transferName,
            garmentColor,
            notes,
            JSON.stringify(files),
            unitPriceCents,
            totalPriceCents,
            session.id,
            shippingAddressJson,
          ]
        );

        if (result.rowCount) {
          console.log(
            "Inserted/updated dtf_orders row for Stripe session",
            session.id,
            "with shipping_address:",
            shippingAddressJson ? "yes" : "no"
          );
        } else {
          console.log("No row affected for session:", session.id);
        }
      } catch (err) {
        console.error("Failed to insert dtf_orders row from Stripe webhook:", err);
        console.error("Error details:", err.message);
        // Check if it's a column error
        if (err.message && err.message.includes("shipping_address")) {
          console.error("ERROR: The shipping_address column may not exist in the database. Please run: ALTER TABLE dtf_orders ADD COLUMN shipping_address JSONB;");
        }
      } finally {
        client.release();
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({ received: true }));
  });
};


