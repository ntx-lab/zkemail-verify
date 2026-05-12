import { initZkEmailSdk } from "@zk-email/sdk";

// ═══════════════════════════════════════════════════════
//  CONFIG — fill these in before deploying
// ═══════════════════════════════════════════════════════
const CONFIG = {
  // Cloudflare Worker URL
  WORKER_URL: "https://nthu-verify.natxu-tw.workers.dev",

  // TODO: replace with your actual slug once blueprint finishes compiling
  // Format: "github-username/blueprint-name@v1"
  BLUEPRINT_SLUG: "YOUR_GITHUB_USERNAME/nthu-mbti-verify@v1",

  // TODO: replace with your actual Retool URL
  RETOOL_URL: "https://YOUR_ORG.retool.com/apps/mbti-registration",

  // TODO: replace with your Resend verified sender address
  EXPECTED_FROM: "verify@nthu-verify.uk",
};
// ═══════════════════════════════════════════════════════

// ─── DOM refs ───────────────────────────────────────────
const phase1    = document.getElementById("phase1");
const phase2    = document.getElementById("phase2");
const phase3    = document.getElementById("phase3");

// Phase 1
const emailInput   = document.getElementById("emailInput");
const emailHint    = document.getElementById("emailHint");
const sendBtn      = document.getElementById("sendBtn");
const sendingState = document.getElementById("sendingState");
const sendError    = document.getElementById("sendError");

// Phase 2
const sentToAddr     = document.getElementById("sentToAddr");
const uploadZone     = document.getElementById("uploadZone");
const emlFile        = document.getElementById("emlFile");
const fileReady      = document.getElementById("fileReady");
const fileReadyName  = document.getElementById("fileReadyName");
const proveBtn       = document.getElementById("proveBtn");
const backBtn        = document.getElementById("backBtn");

// Phase 3
const generatingState = document.getElementById("generatingState");
const proofStatus     = document.getElementById("proofStatus");
const pstep1 = document.getElementById("pstep1");
const pstep2 = document.getElementById("pstep2");
const pstep3 = document.getElementById("pstep3");
const pstep4 = document.getElementById("pstep4");
const proofError      = document.getElementById("proofError");
const proofErrorMsg   = document.getElementById("proofErrorMsg");
const proofRetryBtn   = document.getElementById("proofRetryBtn");
const proofSuccess    = document.getElementById("proofSuccess");
const tokenContent    = document.getElementById("tokenContent");
const copyBtn         = document.getElementById("copyBtn");
const retoolBtn       = document.getElementById("retoolBtn");

// State
let emlContent = null;
let userEmail  = "";

retoolBtn.href = CONFIG.RETOOL_URL;

// ─── Helpers ────────────────────────────────────────────
function showPhase(n) {
  [phase1, phase2, phase3].forEach((p, i) => {
    p.classList.toggle("hidden", i + 1 !== n);
  });
}

function isValidNthuEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@nthu\.edu\.tw$/i.test(email.trim());
}

function stepDone(el, label) {
  el.textContent = "● " + label;
  el.classList.add("done");
}

// ─── PHASE 1 — Send verification email ─────────────────
emailInput.addEventListener("input", () => {
  const val = emailInput.value.trim();
  if (val && !isValidNthuEmail(val)) {
    emailHint.textContent = "Must be an @nthu.edu.tw address";
  } else {
    emailHint.textContent = "";
  }
});

sendBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!isValidNthuEmail(email)) {
    emailHint.textContent = "Please enter a valid @nthu.edu.tw address";
    emailInput.focus();
    return;
  }

  // Show loading
  sendBtn.classList.add("hidden");
  sendingState.classList.remove("hidden");
  sendError.classList.add("hidden");

  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    // Success — move to phase 2
    userEmail = email;
    sentToAddr.textContent = email;
    showPhase(2);

  } catch (err) {
    sendError.textContent = err.message || "Failed to send email. Please try again.";
    sendError.classList.remove("hidden");
    sendBtn.classList.remove("hidden");
    sendingState.classList.add("hidden");
  }
});

// ─── PHASE 2 — Upload .eml ──────────────────────────────
uploadZone.addEventListener("click", () => emlFile.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

emlFile.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".eml")) {
    alert("Please upload a .eml file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    emlContent = e.target.result;
    fileReadyName.textContent = file.name;
    fileReady.classList.remove("hidden");
    proveBtn.classList.remove("hidden");
  };
  reader.readAsText(file);
}

backBtn.addEventListener("click", () => {
  emlContent = null;
  emlFile.value = "";
  fileReady.classList.add("hidden");
  proveBtn.classList.add("hidden");
  sendBtn.classList.remove("hidden");
  sendingState.classList.add("hidden");
  sendError.classList.add("hidden");
  showPhase(1);
});

proveBtn.addEventListener("click", () => {
  showPhase(3);
  generateProof();
});

// ─── PHASE 3 — Generate proof ───────────────────────────
proofRetryBtn.addEventListener("click", () => {
  showPhase(2);
});

async function generateProof() {
  // Reset state
  generatingState.classList.remove("hidden");
  proofError.classList.add("hidden");
  proofSuccess.classList.add("hidden");
  [pstep1, pstep2, pstep3, pstep4].forEach(el => {
    el.classList.remove("done");
    el.textContent = "◯ " + el.textContent.replace(/^[●◯] /, "");
  });

  // Fix step labels
  pstep1.textContent = "◯ Load blueprint from registry";
  pstep2.textContent = "◯ Validate email signature";
  pstep3.textContent = "◯ Generate zero-knowledge proof";
  pstep4.textContent = "◯ Verify proof";

  try {
    // Step 1 — Load blueprint
    proofStatus.textContent = "Loading blueprint from registry…";
    const sdk = initZkEmailSdk();
    const blueprint = await sdk.getBlueprint(CONFIG.BLUEPRINT_SLUG);
    stepDone(pstep1, "Load blueprint from registry");

    // Step 2 — Validate
    proofStatus.textContent = "Validating email signature…";
    const isValid = await blueprint.validateEmail(emlContent);
    if (!isValid) {
      throw new Error(
        "This email doesn't match the verification blueprint.\n\n" +
        "Make sure you:\n" +
        "• Downloaded the email we sent you (check subject line)\n" +
        "• Downloaded it directly from your NTHU inbox (not forwarded)\n" +
        "• Saved it as .eml (not .txt or other format)"
      );
    }
    stepDone(pstep2, "Validate email signature");

    // Step 3 — Generate proof (remote = faster)
    proofStatus.textContent = "Generating zero-knowledge proof (30–60s)…";
    const prover = blueprint.createProver({ isLocal: false });
    const proof = await prover.generateProof(emlContent);
    stepDone(pstep3, "Generate zero-knowledge proof");

    // Step 4 — Verify
    proofStatus.textContent = "Verifying proof…";
    const verified = await blueprint.verifyProof(proof);
    if (!verified) {
      throw new Error("Proof verification failed. Please try downloading a fresh copy of the email.");
    }
    stepDone(pstep4, "Verify proof");

    // Show result
    const token = JSON.stringify({
      proofData: proof.props.proofData,
      publicData: proof.props.publicData,
    });

    tokenContent.textContent = token;
    generatingState.classList.add("hidden");
    proofSuccess.classList.remove("hidden");

  } catch (err) {
    console.error(err);
    generatingState.classList.add("hidden");
    proofErrorMsg.textContent = err?.message || "Unknown error occurred.";
    proofError.classList.remove("hidden");
  }
}

// ─── Copy button ─────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenContent.textContent);
    copyBtn.textContent = "✓ Copied!";
    setTimeout(() => { copyBtn.textContent = "⎘ Copy token"; }, 2000);
  } catch {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tokenContent);
    sel.removeAllRanges();
    sel.addRange(range);
  }
});
