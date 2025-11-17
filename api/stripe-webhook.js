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
      
      // Check if we have a temp order ID - means order was created before checkout
      const tempOrderId = m.tempOrderId ? parseInt(m.tempOrderId, 10) : null;
      let existingOrder = null;
      
      console.log("Metadata tempOrderId:", m.tempOrderId, "parsed:", tempOrderId);
      
      // Try to find existing order by tempOrderId first
      if (tempOrderId) {
        console.log("Looking for order by tempOrderId:", tempOrderId);
        try {
          const checkClient = await pool.connect();
          try {
            const checkResult = await checkClient.query(
              `SELECT id, gang_sheet_data, stripe_session_id, created_at FROM dtf_orders WHERE id = $1`,
              [tempOrderId]
            );
            if (checkResult.rows.length > 0) {
              existingOrder = checkResult.rows[0];
              const hasGangSheetData = existingOrder.gang_sheet_data !== null;
              console.log("✓ Found existing order by ID:", existingOrder.id);
              console.log("  Created at:", existingOrder.created_at);
              console.log("  Current session_id:", existingOrder.stripe_session_id);
              console.log("  Has gang_sheet_data:", hasGangSheetData);
              if (hasGangSheetData) {
                const dataPreview = JSON.stringify(existingOrder.gang_sheet_data).substring(0, 100);
                console.log("  Data preview:", dataPreview);
              } else {
                console.error("WARNING: Existing order has NULL gang_sheet_data!");
              }
            } else {
              console.error("Order not found by tempOrderId:", tempOrderId);
            }
          } finally {
            checkClient.release();
          }
        } catch (dbErr) {
          console.error("Failed to check for existing order:", dbErr);
          console.error("Error details:", dbErr.message);
        }
      }
      
      // Fallback: Look for pending orders with gang_sheet_data that match this checkout
      // This handles cases where tempOrderId wasn't passed or order wasn't found
      if (!existingOrder) {
        console.log("No order found by tempOrderId, searching for pending orders with gang_sheet_data");
        try {
          const checkClient = await pool.connect();
          try {
            // Find most recent pending order with gang_sheet_data (created in last 10 minutes)
            const checkResult = await checkClient.query(
              `SELECT id, gang_sheet_data, stripe_session_id, created_at 
               FROM dtf_orders 
               WHERE stripe_session_id LIKE 'pending-%' 
                 AND gang_sheet_data IS NOT NULL
                 AND created_at > NOW() - INTERVAL '10 minutes'
               ORDER BY created_at DESC
               LIMIT 1`,
              []
            );
            if (checkResult.rows.length > 0) {
              existingOrder = checkResult.rows[0];
              console.log("✓ Found pending order with gang_sheet_data:", existingOrder.id);
              console.log("  Created at:", existingOrder.created_at);
              console.log("  Session_id:", existingOrder.stripe_session_id);
            } else {
              console.log("No pending orders with gang_sheet_data found");
            }
          } finally {
            checkClient.release();
          }
        } catch (dbErr) {
          console.error("Failed to search for pending orders:", dbErr);
        }
      }
      
      if (!existingOrder) {
        console.log("No existing order found - will create new one (regular order, not gang-sheet)");
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
        
        let result;
        
        // If we have an existing order (created before checkout), just update it
        if (existingOrder) {
          console.log("Updating existing order", existingOrder.id, "with Stripe session", session.id);
          console.log("  Current session_id:", existingOrder.stripe_session_id);
          console.log("  Has gang_sheet_data:", existingOrder.gang_sheet_data ? "YES" : "NO");
          
          // First check if this session_id is already used by another order
          const conflictCheck = await client.query(
            `SELECT id FROM dtf_orders WHERE stripe_session_id = $1 AND id != $2`,
            [session.id, existingOrder.id]
          );
          
          if (conflictCheck.rowCount > 0) {
            console.error("ERROR: Session ID", session.id, "already exists for order", conflictCheck.rows[0].id);
            console.error("  This should not happen - session IDs should be unique");
          }
          
          // Update the existing order - preserve gang_sheet_data (it's already saved)
          // Only update if the order doesn't already have a real session_id (not a temp one)
          const shouldUpdate = !existingOrder.stripe_session_id || existingOrder.stripe_session_id.startsWith('pending-');
          
          if (shouldUpdate) {
            result = await client.query(
              `UPDATE dtf_orders
               SET stripe_session_id = $1,
                   shipping_address = COALESCE($2, shipping_address),
                   status = COALESCE(status, 'pending')
               WHERE id = $3
                 AND (stripe_session_id IS NULL OR stripe_session_id LIKE 'pending-%')
               RETURNING id, shipping_address, gang_sheet_data`,
              [session.id, finalShippingAddressJson, existingOrder.id]
            );
            
            if (result.rowCount > 0) {
              const savedGangSheetData = result.rows[0].gang_sheet_data;
              console.log("✓ Updated existing order. Has gang_sheet_data:", savedGangSheetData ? "YES" : "NO - NULL!");
              if (!savedGangSheetData && existingOrder.gang_sheet_data) {
                console.error("ERROR: gang_sheet_data was lost during update!");
              }
            } else {
              console.error("ERROR: Update returned 0 rows. Order may have already been updated.");
              // Fall through to create new order
              result = null;
            }
          } else {
            console.log("Order already has a real session_id, skipping update");
            result = { rowCount: 0 };
          }
        } else {
          // No existing order - create new one (fallback for non-gang-sheet orders)
          console.log("Creating new order (no existing order found)");
          
          // Check if session_id already exists
          const existingSessionCheck = await client.query(
            `SELECT id, gang_sheet_data FROM dtf_orders WHERE stripe_session_id = $1`,
            [session.id]
          );
          
          if (existingSessionCheck.rowCount > 0) {
            console.log("Order with this session_id already exists, updating it");
            const existing = existingSessionCheck.rows[0];
            result = await client.query(
              `UPDATE dtf_orders
               SET shipping_address = COALESCE($1, shipping_address),
                   status = COALESCE(status, 'pending')
               WHERE stripe_session_id = $2
               RETURNING id, shipping_address, gang_sheet_data`,
              [finalShippingAddressJson, session.id]
            );
          } else {
            // Create new order
            const query = `INSERT INTO dtf_orders
                 (mode, size, quantity, transfer_name, garment_color, notes,
                  files, unit_price_cents, total_price_cents, stripe_session_id, status, shipping_address)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
               RETURNING id, shipping_address`;
            
            const params = [
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


