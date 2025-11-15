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

      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO dtf_orders
             (mode, size, quantity, transfer_name, garment_color, notes,
              files, unit_price_cents, total_price_cents, stripe_session_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
           ON CONFLICT (stripe_session_id) DO NOTHING
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
          ]
        );

        if (result.rowCount) {
          console.log(
            "Inserted dtf_orders row for Stripe session",
            session.id
          );
        }
      } catch (err) {
        console.error("Failed to insert dtf_orders row from Stripe webhook:", err);
      } finally {
        client.release();
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({ received: true }));
  });
};


