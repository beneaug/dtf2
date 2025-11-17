// Sample Vercel / Node serverless function for handling DTF orders.
// This version shows how you might plug in Neon (Postgres) and AWS S3.
// It still omits full error handling and hard limits, so treat it as a starting point.

const Busboy = require("busboy");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const Stripe = require("stripe");
const { Pool } = require("pg");

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

const stripe =
  process.env.STRIPE_SECRET_KEY &&
  Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
  }

  const busboy = Busboy({ headers: req.headers });
  const fields = {};
  const fileUploads = [];

  busboy.on("field", (name, value) => {
    fields[name] = value;
  });

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const chunks = [];
    file.on("data", (data) => chunks.push(data));
    file.on("limit", () => {
      file.resume();
    });
    file.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (!filename) return;

      const key = `dtf-orders/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${filename}`;

      const putPromise = s3
        .send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimetype,
          })
        )
        .then(() => ({
          fieldname,
          filename,
          mimetype,
          size: buffer.length,
          key,
        }));

      fileUploads.push(putPromise);
    });
  });

  busboy.on("finish", async () => {
    try {
      const uploadedFiles = await Promise.all(fileUploads);

      const quantity = parseInt(fields.quantity, 10) || 1;
      const mode = fields.mode || "single-image";
      const size = fields.size || null;
      const transferName = fields.transferName || null;
      const garmentColor = fields.garmentColor || null;
      const notes = fields.notes || null;
      
      // Extract gang sheet data if present
      let gangSheetData = null;
      let tempOrderId = null;
      if (fields.gangSheetData) {
        try {
          const parsed = typeof fields.gangSheetData === 'string' 
            ? JSON.parse(fields.gangSheetData) 
            : fields.gangSheetData;
          gangSheetData = parsed;
          console.log("Parsed gang sheet data, size:", JSON.stringify(gangSheetData).length, "chars");
          console.log("  Has sheetSizeId:", !!gangSheetData.sheetSizeId);
          console.log("  Has instanceLayout:", !!gangSheetData.instanceLayout);
          console.log("  Instance count:", gangSheetData.instanceLayout?.length || 0);
        } catch (e) {
          console.error("Failed to parse gangSheetData:", e);
          console.error("  Raw value:", fields.gangSheetData);
        }
      } else {
        console.log("No gangSheetData field found in form data");
        console.log("  Available fields:", Object.keys(fields));
      }

      const unitPrice = fields.unitPrice ? parseFloat(fields.unitPrice) : null;
      const totalPrice = fields.totalPrice
        ? parseFloat(fields.totalPrice)
        : null;
      const unitPriceCents =
        Number.isFinite(unitPrice) && unitPrice >= 0
          ? Math.round(unitPrice * 100)
          : null;
      const totalPriceCents =
        Number.isFinite(totalPrice) && totalPrice >= 0
          ? Math.round(totalPrice * 100)
          : null;

      // STEP 1: Create order record BEFORE Stripe checkout
      // This ensures all data (including gang_sheet_data) is saved immediately
      // Simple approach: Always create new order, use order ID as identifier
      if (pool) {
        try {
          const client = await pool.connect();
          try {
            // Generate temporary session ID (will be replaced by real Stripe session ID in webhook)
            const tempSessionId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            
            console.log("Creating order record before checkout");
            console.log("  Mode:", mode);
            console.log("  Has gang_sheet_data:", !!gangSheetData);
            if (gangSheetData) {
              console.log("  Gang sheet instances:", gangSheetData.instanceLayout?.length || 0);
            }
            
            // Always create new order - simple and reliable
            const insertResult = await client.query(
              `INSERT INTO dtf_orders
                 (mode, size, quantity, transfer_name, garment_color, notes,
                  files, unit_price_cents, total_price_cents, stripe_session_id, status, gang_sheet_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11::jsonb)
               RETURNING id, gang_sheet_data`,
              [
                mode,
                size,
                quantity,
                transferName,
                garmentColor,
                notes,
                JSON.stringify(uploadedFiles),
                unitPriceCents,
                totalPriceCents,
                tempSessionId,
                gangSheetData, // Will be NULL if not gang-sheet order
              ]
            );
            
            if (insertResult.rows.length > 0) {
              tempOrderId = insertResult.rows[0].id;
              const savedGangSheetData = insertResult.rows[0].gang_sheet_data;
              console.log("✓ Created order record");
              console.log("  Order ID:", tempOrderId);
              console.log("  Temp session_id:", tempSessionId);
              console.log("  gang_sheet_data saved:", savedGangSheetData ? "YES" : "NO (expected for non-gang-sheet orders)");
              
              if (gangSheetData && !savedGangSheetData) {
                console.error("ERROR: gang_sheet_data was NOT saved but should have been!");
              }
            } else {
              console.error("ERROR: Order insert returned no rows");
            }
          } finally {
            client.release();
          }
        } catch (dbErr) {
          console.error("CRITICAL: Failed to create order record:", dbErr);
          console.error("  Error message:", dbErr.message);
          console.error("  Error stack:", dbErr.stack);
          // Don't continue - fail the request if we can't save the order
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ 
            error: "Failed to create order. Please try again.",
            details: process.env.NODE_ENV === 'development' ? dbErr.message : undefined
          }));
        }
      } else {
        console.error("CRITICAL: Database pool not available");
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Database not available. Please try again later." }));
      }

      let checkoutUrl = null;
      if (stripe && totalPriceCents && totalPriceCents > 0) {
        const origin = (req.headers.origin || "").replace(/\/$/, "");
        
        // Build metadata - include order ID so webhook can find and update it
        const metadata = {
          orderId: String(tempOrderId), // Primary identifier - always use order ID
          mode,
          size,
          quantity: String(quantity),
          transferName: transferName || "",
          garmentColor: garmentColor || "",
          notes: notes || "",
          files: JSON.stringify(uploadedFiles),
          unitPriceCents:
            unitPriceCents != null ? String(unitPriceCents) : "",
          totalPriceCents:
            totalPriceCents != null ? String(totalPriceCents) : "",
        };
        
        // orderId is already in metadata above - that's all we need
        
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    transferName ||
                    "DTF transfer order",
                },
                unit_amount:
                  unitPriceCents ||
                  Math.max(1, Math.round(totalPriceCents / quantity)),
              },
              quantity,
            },
          ],
          shipping_address_collection: {
            allowed_countries: ["US", "CA"],
          },
          metadata,
          success_url:
            process.env.STRIPE_SUCCESS_URL ||
            `${origin}/order?success=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:
            process.env.STRIPE_CANCEL_URL ||
            `${origin}/order?canceled=1`,
        });
        checkoutUrl = session.url;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          ok: true,
          checkoutUrl,
        })
      );
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          error:
            "Failed to process DTF order. Check server logs and environment configuration.",
        })
      );
    }
  });

  req.pipe(busboy);
};



