// Sample Vercel / Node serverless function for handling DTF orders.
// This version shows how you might plug in Neon (Postgres) and AWS S3.
// It still omits full error handling and hard limits, so treat it as a starting point.

const Busboy = require("busboy");
const { Pool } = require("pg");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const Stripe = require("stripe");

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

      const client = await pool.connect();
      try {
        const quantity = parseInt(fields.quantity, 10) || 1;
        const mode = fields.mode || "single-image";
        const size = fields.size || null;
        const transferName = fields.transferName || null;
        const garmentColor = fields.garmentColor || null;
        const notes = fields.notes || null;

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

        // Example table:
        // CREATE TABLE dtf_orders (
        //   id serial PRIMARY KEY,
        //   created_at timestamptz DEFAULT now(),
        //   mode text,
        //   size text,
        //   quantity integer,
        //   transfer_name text,
        //   garment_color text,
        //   notes text,
        //   files jsonb,
        //   unit_price_cents integer,
        //   total_price_cents integer
        // );

        const result = await client.query(
          `INSERT INTO dtf_orders
           (mode, size, quantity, transfer_name, garment_color, notes, files,
            unit_price_cents, total_price_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, created_at`,
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
          ]
        );

        const order = result.rows[0];

        let checkoutUrl = null;
        if (stripe && totalPriceCents && totalPriceCents > 0) {
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
                      `DTF transfer order #${order.id}`,
                  },
                  // charge per transfer, quantity is number of transfers
                  unit_amount:
                    unitPriceCents || Math.max(1, Math.round(totalPriceCents / quantity)),
                },
                quantity,
              },
            ],
            metadata: {
              order_id: order.id.toString(),
            },
            success_url:
              process.env.STRIPE_SUCCESS_URL ||
              `${(req.headers.origin || "").replace(/\/$/, "")}/order.html?success=1&orderId=${order.id}`,
            cancel_url:
              process.env.STRIPE_CANCEL_URL ||
              `${(req.headers.origin || "").replace(/\/$/, "")}/order.html?canceled=1`,
          });
          checkoutUrl = session.url;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            ok: true,
            orderId: order.id,
            createdAt: order.created_at,
            checkoutUrl,
          })
        );
      } finally {
        client.release();
      }
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



