const crypto = require("crypto");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      // basic safeguard
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
    return res.end(JSON.stringify({ error: "Use POST for login." }));
  }

  const expectedUser = process.env.OPERATOR_USER;
  const expectedPass = process.env.OPERATOR_PASS;
  const sessionToken =
    process.env.OPERATOR_SESSION_TOKEN ||
    crypto.randomBytes(32).toString("hex");

  if (!expectedUser || !expectedPass) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error:
          "Operator credentials not configured. Set OPERATOR_USER and OPERATOR_PASS.",
      })
    );
  }

  try {
    const body = await readJsonBody(req);
    const { username, password } = body || {};

    if (username !== expectedUser || password !== expectedPass) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Invalid credentials." }));
    }

    // Set secure session cookie
    const cookieVal = encodeURIComponent(sessionToken);
    const parts = [
      `op_session=${cookieVal}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=604800",
    ];
    // Secure for production; Vercel is HTTPS
    if (req.headers["x-forwarded-proto"] === "https") {
      parts.push("Secure");
    }

    res.statusCode = 200;
    res.setHeader("Set-Cookie", parts.join("; "));
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error(err);
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Malformed login request." }));
  }
};


