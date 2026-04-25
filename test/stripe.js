// ============================================================
// LIZZIE RH — Intégration Stripe Complète
// Fichier : src/services/stripe.js
// ============================================================

import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

// ============================================================
// PLANS — IDs à remplacer par tes vrais Price IDs Stripe
// ============================================================

export const PLANS = {
  STARTER: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER,    // ex: price_xxxxx
    price: 29,
    currency: "eur",
    maxEmployees: 5,
    features: [
      "Jusqu'à 5 employés",
      "Conversations illimitées avec Lizzie",
      "Alertes automatiques",
      "Tableau de bord bien-être",
      "Support email",
    ],
  },
  PRO: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO,        // ex: price_xxxxx
    price: 79,
    currency: "eur",
    maxEmployees: 50,
    features: [
      "Jusqu'à 50 employés",
      "Tout Starter inclus",
      "Rapports avancés",
      "Check-ins automatiques",
      "Intégration Slack",
      "Support prioritaire",
    ],
  },
  ENTERPRISE: {
    name: "Entreprise",
    priceId: process.env.STRIPE_PRICE_ENTERPRISE, // ex: price_xxxxx
    price: 199,
    currency: "eur",
    maxEmployees: Infinity,
    features: [
      "Employés illimités",
      "Tout Pro inclus",
      "Multi-départements",
      "SSO / SAML",
      "Audit log RGPD complet",
      "Onboarding dédié",
      "SLA garanti",
    ],
  },
};

// ============================================================
// 1. CRÉER UN CUSTOMER STRIPE (à l'inscription)
// ============================================================

export async function createStripeCustomer(tenant, ownerEmail) {
  const customer = await stripe.customers.create({
    email: ownerEmail,
    name: tenant.name,
    metadata: {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    },
  });

  // Sauvegarder le customer ID en base
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      stripeCustomerId: customer.id,
      plan: "STARTER",
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 jours
    },
  });

  return customer;
}

// ============================================================
// 2. CRÉER UNE SESSION CHECKOUT (paiement)
// ============================================================

export async function createCheckoutSession({ tenantId, planKey, successUrl, cancelUrl }) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Plan inconnu : ${planKey}`);

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (!subscription) throw new Error("Abonnement introuvable pour ce tenant");

  const session = await stripe.checkout.sessions.create({
    customer: subscription.stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: subscription.status === "TRIALING" ? undefined : 0,
      metadata: {
        tenantId,
        plan: planKey,
      },
    },
    metadata: {
      tenantId,
      plan: planKey,
    },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "required",
    locale: "fr",
  });

  return session;
}

// ============================================================
// 3. CRÉER UN PORTAIL CLIENT (gérer abonnement)
// ============================================================

export async function createBillingPortalSession(tenantId, returnUrl) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (!subscription?.stripeCustomerId) {
    throw new Error("Aucun customer Stripe trouvé");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
}

// ============================================================
// 4. WEBHOOKS STRIPE (événements entrants)
// ============================================================

export async function handleStripeWebhook(rawBody, signature) {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature invalide :", err.message);
    throw new Error("Webhook signature invalide");
  }

  console.log(`📩 Webhook reçu : ${event.type}`);

  switch (event.type) {

    // ── Abonnement créé ou mis à jour ──────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      await syncSubscription(sub);
      break;
    }

    // ── Abonnement annulé ──────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await cancelSubscription(sub);
      break;
    }

    // ── Paiement réussi ────────────────────────────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      await onPaymentSucceeded(invoice);
      break;
    }

    // ── Paiement échoué ────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await onPaymentFailed(invoice);
      break;
    }

    // ── Checkout terminé ──────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object;
      await onCheckoutCompleted(session);
      break;
    }

    default:
      console.log(`ℹ️ Événement non géré : ${event.type}`);
  }

  return { received: true };
}

// ============================================================
// HANDLERS INTERNES
// ============================================================

async function syncSubscription(stripeSub) {
  const tenantId = stripeSub.metadata?.tenantId;
  if (!tenantId) return;

  const plan = getPlanFromPriceId(stripeSub.items.data[0]?.price?.id);
  const status = mapStripeStatus(stripeSub.status);

  await prisma.subscription.update({
    where: { tenantId },
    data: {
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: stripeSub.items.data[0]?.price?.id,
      plan,
      status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
  });

  console.log(`✅ Abonnement synchronisé — Tenant: ${tenantId} | Plan: ${plan} | Status: ${status}`);
}

async function cancelSubscription(stripeSub) {
  const tenantId = stripeSub.metadata?.tenantId;
  if (!tenantId) return;

  await prisma.subscription.update({
    where: { tenantId },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
    },
  });

  console.log(`🚫 Abonnement annulé — Tenant: ${tenantId}`);
  // TODO: envoyer email de confirmation d'annulation
}

async function onPaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!sub) return;

  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: { status: "ACTIVE" },
  });

  console.log(`💰 Paiement réussi — Customer: ${customerId}`);
  // TODO: envoyer facture par email
}

async function onPaymentFailed(invoice) {
  const customerId = invoice.customer;

  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: { status: "PAST_DUE" },
  });

  console.log(`❌ Paiement échoué — Customer: ${customerId}`);
  // TODO: envoyer email d'alerte avec lien de mise à jour CB
}

async function onCheckoutCompleted(session) {
  const tenantId = session.metadata?.tenantId;
  const plan = session.metadata?.plan;

  if (!tenantId || !plan) return;

  // Récupérer l'abonnement Stripe créé
  const stripeSubId = session.subscription;
  if (!stripeSubId) return;

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  await syncSubscription({ ...stripeSub, metadata: { tenantId, plan } });

  console.log(`🎉 Checkout complété — Tenant: ${tenantId} | Plan: ${plan}`);
  // TODO: envoyer email de bienvenue
}

// ============================================================
// UTILITAIRES
// ============================================================

function getPlanFromPriceId(priceId) {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return key;
  }
  return "STARTER";
}

function mapStripeStatus(stripeStatus) {
  const map = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
  };
  return map[stripeStatus] || "ACTIVE";
}

// ============================================================
// VÉRIFIER ACCÈS (middleware Express)
// ============================================================

export async function requireActiveSubscription(req, res, next) {
  try {
    const tenantId = req.tenantId; // injecté par ton middleware auth

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      return res.status(403).json({ error: "Aucun abonnement trouvé" });
    }

    const isActive = ["ACTIVE", "TRIALING"].includes(subscription.status);

    // Vérifier si le trial est expiré
    if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
      if (new Date() > subscription.trialEndsAt) {
        return res.status(402).json({
          error: "Période d'essai expirée",
          upgradeUrl: "/billing",
        });
      }
    }

    if (!isActive) {
      return res.status(402).json({
        error: "Abonnement inactif",
        status: subscription.status,
        upgradeUrl: "/billing",
      });
    }

    req.subscription = subscription;
    next();
  } catch (err) {
    console.error("Erreur vérification abonnement :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// ============================================================
// VÉRIFIER LIMITE D'EMPLOYÉS SELON LE PLAN
// ============================================================

export async function checkEmployeeLimit(req, res, next) {
  try {
    const { tenantId, subscription } = req;
    const plan = PLANS[subscription.plan];

    if (!plan) return next();

    const count = await prisma.employee.count({
      where: { tenantId, status: "ACTIVE" },
    });

    if (count >= plan.maxEmployees) {
      return res.status(403).json({
        error: `Limite de ${plan.maxEmployees} employés atteinte pour le plan ${plan.name}`,
        currentCount: count,
        limit: plan.maxEmployees,
        upgradeUrl: "/billing",
      });
    }

    next();
  } catch (err) {
    console.error("Erreur vérification limite employés :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}
