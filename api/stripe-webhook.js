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
      
      // Extract gang sheet data - either from metadata (legacy) or from pre-order
      let gangSheetData = null;
      const preOrderId = m.preOrderId ? parseInt(m.preOrderId, 10) : null;
      
      // If we have a pre-order ID, retrieve gang sheet data from database
      if (preOrderId) {
        try {
          const client = await pool.connect();
          try {
            const result = await client.query(
              `SELECT gang_sheet_data FROM dtf_orders WHERE id = $1`,
              [preOrderId]
            );
            if (result.rows.length > 0 && result.rows[0].gang_sheet_data) {
              gangSheetData = result.rows[0].gang_sheet_data;
              console.log("Retrieved gang sheet data from pre-order:", preOrderId);
            }
          } finally {
            client.release();
          }
        } catch (dbErr) {
          console.error("Failed to retrieve gang sheet data from pre-order:", dbErr);
        }
      }
      
      // Fallback: try to parse from metadata (for backwards compatibility)
      if (!gangSheetData && m.gangSheetData) {
        try {
          gangSheetData = JSON.parse(m.gangSheetData);
        } catch (e) {
          console.error("Failed to parse gangSheetData from metadata:", e);
        }
      }

      // Extract shipping address from session
      // Always retrieve full session to ensure we have shipping details
      // Webhook events may not include shipping_details by default
      let shippingAddress = null;
      
      console.log("Processing webhook for session:", session.id);
      console.log("Session object keys:", Object.keys(session));
      console.log("Session shipping_address_collection:", session.shipping_address_collection);
      console.log("Session shipping_details (from event):", session.shipping_details);
      
      try {
        // Retrieve full session - shipping_details is already included by default
        const fullSession = await stripe.checkout.sessions.retrieve(session.id);
        
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
            const retrySession = await stripe.checkout.sessions.retrieve(session.id);
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
        const mode = m.mode || "single-image";
        
        // If we have a pre-order ID, update that record instead of creating a new one
        let result;
        let updatedPreOrder = false;
        
        if (preOrderId) {
          console.log("Updating pre-order", preOrderId, "with Stripe session", session.id);
          
          // First verify the pre-order exists and has gang_sheet_data
          const checkResult = await client.query(
            `SELECT id, gang_sheet_data FROM dtf_orders WHERE id = $1`,
            [preOrderId]
          );
          
          if (checkResult.rowCount === 0) {
            console.error("Pre-order not found:", preOrderId, "- will create new order");
            result = null; // Signal to create new order
          } else {
            let existingGangSheetData = checkResult.rows[0].gang_sheet_data;
            const hasGangSheetData = existingGangSheetData !== null;
            console.log("Pre-order found. Has gang_sheet_data:", hasGangSheetData);
            
            if (!hasGangSheetData) {
              console.error("WARNING: Pre-order exists but gang_sheet_data is NULL!");
              // If we have gangSheetData from retrieval, use it
              if (gangSheetData) {
                console.log("Using retrieved gangSheetData to populate missing data");
                existingGangSheetData = gangSheetData;
              }
            }
            
            // Update the pre-order - explicitly preserve or set gang_sheet_data
            // Use the existing data if available, otherwise use retrieved data, otherwise keep existing
            const dataToSave = existingGangSheetData || gangSheetData;
            
            result = await client.query(
              `UPDATE dtf_orders
               SET stripe_session_id = $1,
                   shipping_address = COALESCE($2, shipping_address),
                   status = COALESCE(status, 'pending'),
                   gang_sheet_data = COALESCE($4, gang_sheet_data)
               WHERE id = $3
               RETURNING id, shipping_address, gang_sheet_data`,
              [session.id, finalShippingAddressJson, preOrderId, dataToSave]
            );
            
            if (result.rowCount > 0) {
              updatedPreOrder = true;
              const updatedHasData = result.rows[0].gang_sheet_data !== null;
              const updatedDataStr = updatedHasData ? JSON.stringify(result.rows[0].gang_sheet_data).substring(0, 100) : "null";
              console.log("✓ Updated pre-order. Has gang_sheet_data after update:", updatedHasData);
              console.log("  Data preview:", updatedDataStr);
              if (!updatedHasData) {
                console.error("ERROR: gang_sheet_data is still NULL after update!");
                console.error("  Data we tried to save:", dataToSave ? "present" : "null");
              }
            } else {
              console.error("ERROR: Update query returned 0 rows!");
            }
          }
        }
        
        // Only create new order if we didn't successfully update a pre-order
        if (!updatedPreOrder && (!result || result.rowCount === 0)) {
          console.log("Creating new order (pre-order update failed or no pre-order)");
          
          // Build the query - ALWAYS include gang_sheet_data if we have it
          const hasGangSheetData = gangSheetData !== null;
          console.log("Has gangSheetData for new order:", hasGangSheetData);
          
          const query = hasGangSheetData
            ? `INSERT INTO dtf_orders
                 (mode, size, quantity, transfer_name, garment_color, notes,
                  files, unit_price_cents, total_price_cents, stripe_session_id, status, shipping_address, gang_sheet_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12::jsonb)
               ON CONFLICT (stripe_session_id) 
               DO UPDATE SET 
                 shipping_address = COALESCE(EXCLUDED.shipping_address, dtf_orders.shipping_address),
                 status = COALESCE(dtf_orders.status, EXCLUDED.status),
                 gang_sheet_data = COALESCE(EXCLUDED.gang_sheet_data, dtf_orders.gang_sheet_data)
               RETURNING id, shipping_address, gang_sheet_data`
            : `INSERT INTO dtf_orders
                 (mode, size, quantity, transfer_name, garment_color, notes,
                  files, unit_price_cents, total_price_cents, stripe_session_id, status, shipping_address)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
               ON CONFLICT (stripe_session_id) 
               DO UPDATE SET 
                 shipping_address = COALESCE(EXCLUDED.shipping_address, dtf_orders.shipping_address),
                 status = COALESCE(dtf_orders.status, EXCLUDED.status)
               RETURNING id, shipping_address`;
          
          const params = hasGangSheetData
            ? [
                mode,
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
                gangSheetData, // Pass object directly with ::jsonb cast
              ]
            : [
                mode,
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
              ];
          
          result = await client.query(query, params);
          
          if (result.rowCount > 0 && hasGangSheetData) {
            const savedHasData = result.rows[0].gang_sheet_data !== null;
            console.log("✓ Created new order. Has gang_sheet_data:", savedHasData);
            if (!savedHasData) {
              console.error("ERROR: gang_sheet_data was not saved to new order!");
            }
          }
        }

        if (result && result.rowCount > 0) {
          const savedAddress = result.rows[0].shipping_address;
          const savedGangSheetData = result.rows[0].gang_sheet_data;
          console.log(
            "✓ Inserted/updated dtf_orders row for Stripe session",
            session.id,
            "with shipping_address:",
            savedAddress ? "yes" : "no",
            "with gang_sheet_data:",
            savedGangSheetData ? "yes" : "NO - NULL!"
          );
          if (!savedAddress && finalShippingAddressJson) {
            console.error("WARNING: Shipping address was extracted but not saved!");
          }
          if (!savedGangSheetData && gangSheetData) {
            console.error("ERROR: gang_sheet_data was provided but not saved!");
            console.error("  This is a critical error - order data is incomplete!");
          }
        } else {
          console.error("ERROR: No row affected for session:", session.id);
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


