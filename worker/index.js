/**
 * NTHU MBTI Verification — Cloudflare Worker
 *
 * Handles:
 *   POST /send  — sends a verification email to a @nthu.edu.tw address
 *
 * Environment variables to set in Cloudflare dashboard:
 *   RESEND_API_KEY   — your Resend.com API key
 *   FROM_EMAIL       — verified sender address (e.g. verify@yourdomain.com)
 *   ALLOWED_ORIGIN   — your GitHub Pages URL (e.g. https://yourname.github.io)
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // ── CORS headers ──────────────────────────────────────────
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── POST /send ────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/send") {
      return handleSend(request, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  },
};

// ─────────────────────────────────────────────────────────────
async function handleSend(request, env, corsHeaders) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();

  // Validate it's an NTHU address
  if (!/^[a-z0-9._%+\-]+@nthu\.edu\.tw$/.test(email)) {
    return json({ error: "Only @nthu.edu.tw addresses are accepted" }, 400);
  }

  // Rate limiting — simple check via KV if available (optional)
  // If you have a KV namespace bound as RATE_LIMIT_KV, this prevents
  // the same address from triggering more than 3 emails per hour
  if (env.RATE_LIMIT_KV) {
    const key = `rate:${email}`;
    const count = parseInt((await env.RATE_LIMIT_KV.get(key)) || "0");
    if (count >= 3) {
      return json({ error: "Too many requests. Please wait before requesting another email." }, 429);
    }
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  // Send via Resend
  const emailPayload = {
    from: env.FROM_EMAIL,
    to: email,
    subject: "NTHU MBTI Match — Identity Verification",
    html: buildEmailHtml(email),
    text: buildEmailText(email),
  };

  let resendRes;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });
  } catch (err) {
    return json({ error: "Failed to reach email service. Try again." }, 502);
  }

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error("Resend error:", errBody);
    return json({ error: "Failed to send email. Please try again." }, 502);
  }

  return json({ ok: true, message: "Verification email sent" });
}

// ─── Email templates ──────────────────────────────────────────
function buildEmailHtml(email) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { margin:0; padding:0; background:#080a0e; font-family: 'Outfit', Arial, sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .logo { font-size:28px; font-weight:900; color:#4fffb0; letter-spacing:0.05em; margin-bottom:32px; }
  .card { background:#0f1117; border:1px solid #1e2333; border-radius:10px; padding:32px; }
  .card h1 { color:#dde2f0; font-size:24px; margin:0 0 12px; }
  .card p { color:#5a6280; font-size:15px; line-height:1.7; margin:0 0 16px; }
  .card p strong { color:#dde2f0; }
  .instr { background:#171b25; border:1px solid #2a3050; border-radius:8px; padding:20px; margin:24px 0; }
  .instr-title { color:#4db8ff; font-size:12px; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:12px; }
  .step { display:flex; gap:12px; margin-bottom:10px; font-size:14px; color:#5a6280; line-height:1.5; }
  .step-n { color:#4fffb0; font-weight:700; flex-shrink:0; }
  .highlight { color:#4fffb0; font-weight:600; }
  .footer { text-align:center; margin-top:32px; font-size:12px; color:#2a3050; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">MBTI Match</div>
  <div class="card">
    <h1>Verify your NTHU identity</h1>
    <p>
      This email was sent to <strong>${email}</strong> as part of the
      NTHU MBTI Matching registration process. To complete verification,
      you need to download this email and generate a zero-knowledge proof.
    </p>

    <div class="instr">
      <div class="instr-title">How to use this email</div>
      <div class="step"><span class="step-n">1</span><span>Keep this email in your NTHU inbox — do <strong>not</strong> forward it</span></div>
      <div class="step"><span class="step-n">2</span><span>Download it as a <span class="highlight">.eml file</span> using your mail client</span></div>
      <div class="step"><span class="step-n">3</span><span>Upload the .eml to the verification page to generate your proof</span></div>
    </div>

    <p style="font-size:13px; color:#2a3050;">
      <strong style="color:#3a4060;">Gmail:</strong> Open this email → ⋮ menu → Download message<br/>
      <strong style="color:#3a4060;">Outlook:</strong> Open this email → ··· → Download / Save as .eml
    </p>

    <p style="font-size:12px; color:#3a4060; margin-top:24px;">
      Your privacy is protected. The verification system never learns your email address —
      only that you hold an @nthu.edu.tw account.
    </p>
  </div>
  <div class="footer">NTHU MBTI Matching Project · 2025 · Powered by ZK Email</div>
</div>
</body>
</html>`;
}

function buildEmailText(email) {
  return `NTHU MBTI Match — Identity Verification

This email was sent to ${email} as part of the MBTI Matching registration.

HOW TO USE THIS EMAIL:
1. Keep this email in your NTHU inbox — do NOT forward it
2. Download it as a .eml file using your mail client
3. Upload the .eml to the verification page to generate your proof

Gmail: Open this email → ⋮ menu → Download message
Outlook: Open this email → ··· → Download / Save as .eml

Your privacy is protected — the system never learns your actual email address.

NTHU MBTI Matching Project · 2025`;
}
