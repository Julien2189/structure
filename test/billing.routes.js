// ============================================================
// LIZZIE RH — Routes API Billing
// Fichier : src/routes/billing.routes.js
// ============================================================

import express from "express";
import {
  createCheckoutSession,
  createBillingPortalSession,
  handleStripeWebhook,
  PLANS,
} from "../services/stripe.js";
import { requireAuth } from "../middleware/auth.js"; // ton middleware existant

const router = express.Router();

// ── GET /api/billing/plans ─────────────────────────────────
// Retourner les plans disponibles (pour afficher sur la landing)
router.get("/plans", (req, res) => {
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    key,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    maxEmployees: plan.maxEmployees === Infinity ? "Illimité" : plan.maxEmployees,
    features: plan.features,
  }));
  res.json({ plans });
});

// ── POST /api/billing/checkout ─────────────────────────────
// Créer une session de paiement Stripe
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const tenantId = req.tenantId;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: "Plan invalide" });
    }

    const baseUrl = process.env.APP_URL;

    const session = await createCheckoutSession({
      tenantId,
      planKey: plan,
      successUrl: `${baseUrl}/dashboard?upgrade=success`,
      cancelUrl: `${baseUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur checkout :", err);
    res.status(500).json({ error: "Impossible de créer la session de paiement" });
  }
});

// ── POST /api/billing/portal ───────────────────────────────
// Ouvrir le portail client Stripe (gérer/annuler abonnement)
router.post("/portal", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const returnUrl = `${process.env.APP_URL}/billing`;

    const session = await createBillingPortalSession(tenantId, returnUrl);
    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur portail :", err);
    res.status(500).json({ error: "Impossible d'ouvrir le portail" });
  }
});

// ── GET /api/billing/status ────────────────────────────────
// Récupérer le statut d'abonnement du tenant
router.get("/status", requireAuth, async (req, res) => {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId },
    });

    if (!subscription) {
      return res.status(404).json({ error: "Abonnement introuvable" });
    }

    const plan = PLANS[subscription.plan];
    const isTrialing = subscription.status === "TRIALING";
    const trialDaysLeft = isTrialing && subscription.trialEndsAt
      ? Math.max(0, Math.ceil((subscription.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

    res.json({
      plan: subscription.plan,
      planName: plan?.name,
      status: subscription.status,
      isActive: ["ACTIVE", "TRIALING"].includes(subscription.status),
      trialDaysLeft,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      maxEmployees: plan?.maxEmployees === Infinity ? null : plan?.maxEmployees,
    });
  } catch (err) {
    console.error("Erreur status :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── POST /api/billing/webhook ──────────────────────────────
// Webhook Stripe (pas de requireAuth ici — Stripe signe la requête)
// ⚠️ Ce handler doit recevoir le body RAW (non parsé)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // Corps brut obligatoire pour Stripe
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    try {
      await handleStripeWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      console.error("❌ Erreur webhook :", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;


// ============================================================
// LIZZIE RH — Variables d'environnement
// Fichier : .env.example  (copier en .env et remplir)
// ============================================================

/*

# ── Application ───────────────────────────────────────────
APP_URL=http://localhost:3000
NODE_ENV=development
PORT=3000

# ── Base de données (Supabase PostgreSQL recommandé) ──────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/lizzierh?schema=public

# ── Anthropic (Lizzie IA) ─────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# ── JWT Auth ──────────────────────────────────────────────
JWT_SECRET=un-secret-super-long-et-aleatoire-ici
JWT_EXPIRES_IN=7d

# ── Stripe ────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx         # sk_live_ en production
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx    # pk_live_ en production
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx       # Depuis stripe listen --forward-to localhost:3000/api/billing/webhook

# ── Prix Stripe (créer dans dashboard.stripe.com/products)
STRIPE_PRICE_STARTER=price_xxxxxxxxxxxx        # 29€/mois
STRIPE_PRICE_PRO=price_xxxxxxxxxxxx            # 79€/mois
STRIPE_PRICE_ENTERPRISE=price_xxxxxxxxxxxx     # 199€/mois

# ── Email (optionnel - Resend recommandé) ─────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=lizzie@tondomaine.com

*/
