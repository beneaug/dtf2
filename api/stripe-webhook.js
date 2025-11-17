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
  console.log("=== WEBHOOK CALLED ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  
  if (req.method !== "POST") {
    console.log("Wrong method, returning 405");
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
  }

  if (!stripe || !webhookSecret) {
    console.error("Stripe not configured!");
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error:
          "Stripe is not configured. Ensure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.",
      })
    );
  }
  
  console.log("Stripe configured, processing webhook...");

  const chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", async () => {
    console.log("Received webhook body, length:", chunks.reduce((sum, c) => sum + c.length, 0));
    const rawBody = Buffer.concat(chunks);
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        req.headers["stripe-signature"],
        webhookSecret
      );
      console.log("Webhook event constructed. Type:", event.type);
      console.log("Event ID:", event.id);
    } catch (err) {
      console.error("Stripe webhook signature verification failed.", err);
      console.error("Error message:", err.message);
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid Stripe signature." }));
    }

    if (event.type === "checkout.session.completed") {
      console.log("=== PROCESSING checkout.session.completed ===");
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
        
        // If we don't have shipping address yet, try to get it one more time
        if (!shippingAddress) {
          console.log("Retrying shipping address retrieval...");
          try {
            const retrySession = await stripe.checkout.sessions.retrieve(session.id, {
              expand: ["shipping_details", "customer_details"],
            });
            if (retrySession.shipping_details && retrySession.shipping_details.address) {
              const addr = retrySession.shipping_details.address;
              shippingAddress = {
                name: retrySession.shipping_details.name || null,
                line1: addr.line1 || null,
                line2: addr.line2 || null,
                city: addr.city || null,
                state: addr.state || null,
                postal_code: addr.postal_code || null,
                country: addr.country || null,
              };
              console.log("✓ Got shipping address on retry:", JSON.stringify(shippingAddress));
            }
          } catch (retryErr) {
            console.error("Retry failed:", retryErr);
          }
        }
        
        const finalShippingAddressJson = shippingAddress ? JSON.stringify(shippingAddress) : null;
        
        const result = await client.query(
          `INSERT INTO dtf_orders
             (mode, size, quantity, transfer_name, garment_color, notes,
              files, unit_price_cents, total_price_cents, stripe_session_id, status, shipping_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
           ON CONFLICT (stripe_session_id) 
           DO UPDATE SET 
             shipping_address = COALESCE(EXCLUDED.shipping_address, dtf_orders.shipping_address),
             status = COALESCE(dtf_orders.status, EXCLUDED.status)
           RETURNING id, shipping_address`,
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
            finalShippingAddressJson,
          ]
        );

        if (result.rowCount) {
          const savedAddress = result.rows[0].shipping_address;
          console.log(
            "✓ Inserted/updated dtf_orders row for Stripe session",
            session.id,
            "with shipping_address:",
            savedAddress ? "yes" : "no"
          );
          if (!savedAddress && finalShippingAddressJson) {
            console.error("WARNING: Shipping address was extracted but not saved!");
          }
        } else {
          console.log("No row affected for session:", session.id);
        }
      } catch (err) {
        console.error("Failed to insert dtf_orders row from Stripe webhook:", err);
        console.error("Error details:", err.message);
        console.error("Error stack:", err.stack);
        // Check if it's a column error
        if (err.message && err.message.includes("shipping_address")) {
          console.error("ERROR: The shipping_address column may not exist in the database. Please run: ALTER TABLE dtf_orders ADD COLUMN shipping_address JSONB;");
        }
        // Don't fail the webhook - return success so Stripe doesn't retry
      } finally {
        client.release();
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({ received: true }));
  });
};


