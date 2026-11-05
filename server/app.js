import express from "express";
import helmet from "helmet";
import multer from "multer";
import axios from "axios";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openDb, transaction } from "./db.js";
import {
  fail,
  hash,
  safeEqual,
  passwordValid,
  verifySignature,
  priceCart,
  settingsSchema,
  productSchema,
  dateSchema,
  customerSchema,
  validateDate,
  todayIndia,
  addDays,
  held,
} from "./domain.js";
export function createApp(config = {}) {
  const env = config.env || process.env,
    dataDir = path.resolve(config.dataDir || env.DATA_DIR || "data");
  const db = openDb(dataDir),
    app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (/^\/(?:data(?:\/|$)|\.env(?:\.|\/|$)|\.git(?:\/|$))/.test(req.path))
      return res.sendStatus(404);
    next();
  });
  const mode = env.PAYMENT_MODE || "demo";
  if (!["demo", "test", "live"].includes(mode))
    throw Error("Invalid PAYMENT_MODE");
  if (
    mode !== "demo" &&
    (!env.RAZORPAY_KEY_ID?.startsWith(
      mode === "test" ? "rzp_test_" : "rzp_live_",
    ) ||
      !env.RAZORPAY_KEY_SECRET ||
      !env.RAZORPAY_WEBHOOK_SECRET)
  )
    throw Error("Matching Razorpay keys and webhook secret are required");
  const keyPath = path.join(dataDir, "application.key");
  if (!existsSync(keyPath))
    writeFileSync(keyPath, crypto.randomBytes(48).toString("hex"), {
      mode: 0o600,
    });
  const secret = env.SESSION_SECRET || readFileSync(keyPath, "utf8");
  if (secret.length < 32)
    throw Error("SESSION_SECRET must have at least 32 characters");
  const origin = env.APP_ORIGIN || "http://127.0.0.1:3000";
  if (env.NODE_ENV === "production" && (!env.APP_ORIGIN || !env.SESSION_SECRET))
    throw Error("Production requires APP_ORIGIN and SESSION_SECRET");
  if (mode === "live" && !origin.startsWith("https://"))
    throw Error("Live payments require HTTPS");
  const getSettings = () =>
    JSON.parse(db.prepare("SELECT data FROM settings WHERE id=1").get().data);
  const getOrder = (id) => {
    const r = db.prepare("SELECT data FROM orders WHERE id=?").get(id);
    if (!r) fail("Order not found.", 404);
    return JSON.parse(r.data);
  };
  const saveOrder = (o) =>
    db
      .prepare("UPDATE orders SET data=? WHERE id=?")
      .run(JSON.stringify(o), o.id);
  const token = (id) =>
    crypto
      .createHmac("sha256", secret)
      .update("order:" + id)
      .digest("hex");
  const authorizeOrder = (req) => {
    const o = getOrder(req.params.id);
    if (!safeEqual(token(o.id), req.get("x-order-token") || ""))
      fail("Order access denied.", 403);
    return o;
  };
  const id = () => crypto.randomUUID();
  const provider = config.provider || {
    async create(amount, receipt) {
      const r = await axios.post(
        "https://api.razorpay.com/v1/orders",
        { amount, currency: "INR", receipt },
        {
          auth: {
            username: env.RAZORPAY_KEY_ID,
            password: env.RAZORPAY_KEY_SECRET,
          },
          timeout: 15000,
        },
      );
      return r.data;
    },
    async payment(paymentId) {
      if (!/^pay_[a-zA-Z0-9]+$/.test(paymentId)) fail("Invalid payment ID");
      return (
        await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          auth: {
            username: env.RAZORPAY_KEY_ID,
            password: env.RAZORPAY_KEY_SECRET,
          },
          timeout: 15000,
        })
      ).data;
    },
  };
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === "production"
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://checkout.razorpay.com"],
                frameSrc: [
                  "https://api.razorpay.com",
                  "https://checkout.razorpay.com",
                ],
                connectSrc: [
                  "'self'",
                  "https://api.razorpay.com",
                  "https://checkout.razorpay.com",
                ],
                imgSrc: ["'self'", "data:", "https://*.razorpay.com"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'"],
                upgradeInsecureRequests: origin.startsWith("https:")
                  ? []
                  : null,
              },
            }
          : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.path != "/webhooks/razorpay"
    ) {
      const incoming = req.get("origin");
      if (
        (incoming && incoming !== origin) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        return res.status(403).json({ error: "Cross-site request rejected." });
    }
    next();
  });
  const limits = new Map();
  app.use("/api", (req, res, next) => {
    const k =
        (req.socket.remoteAddress || "local") +
        (req.path === "/admin/login" ? ":login" : ":api"),
      now = Date.now(),
      limit = k.endsWith(":login") ? 10 : 240;
    let x = limits.get(k);
    if (!x || x.until < now) x = { count: 0, until: now + 60000 };
    limits.set(k, x);
    if (++x.count > limit)
      return res
        .status(429)
        .json({ error: "Too many requests. Try again in a minute." });
    if (limits.size > 10000)
      for (const [key, v] of limits) if (v.until < now) limits.delete(key);
    next();
  });
  async function sendEmail(orderId) {
    const o = getOrder(orderId);
    if (
      o.mode === "demo" ||
      !o.customer.email ||
      !env.SMTP_HOST ||
      !env.SMTP_FROM
    )
      return;
    const eid = orderId + ":" + o.paidAmount;
    db.prepare("INSERT OR IGNORE INTO outbox VALUES(?,?,?,NULL)").run(
      eid,
      orderId,
      "queued",
    );
    const row = db.prepare("SELECT status FROM outbox WHERE id=?").get(eid);
    if (row.status === "sent") return;
    try {
      const smtp = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_PORT === "465",
        requireTLS: env.SMTP_PORT !== "465",
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      });
      await smtp.sendMail({
        from: env.SMTP_FROM,
        to: o.customer.email,
        subject: `Velvet Spoon ${mode === "test" ? "TEST " : ""}payment confirmation`,
        text: `${mode === "test" ? "TEST MODE — no live payment.\n" : ""}Order ${o.id}\nPayment verified: INR ${o.paidAmount / 100}\nBalance: INR ${(o.total - o.paidAmount) / 100}\nRequested fulfilment: ${o.date}\nStage: ${o.stage}\nYour baker will confirm preparation. Save your private order link from checkout.`,
      });
      db.prepare("UPDATE outbox SET status=?,error=NULL WHERE id=?").run(
        "sent",
        eid,
      );
    } catch {
      db.prepare("UPDATE outbox SET status=?,error=? WHERE id=?").run(
        "failed",
        "SMTP delivery failed; retry from dashboard",
        eid,
      );
    }
  }
  function capture(attempt, payment) {
    if (
      payment.order_id !== attempt.provider_id ||
      payment.amount !== attempt.amount ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      payment.captured !== true
    )
      fail("Payment is not a matching captured INR payment.", 409);
    return transaction(db, () => {
      if (db.prepare("SELECT id FROM payments WHERE id=?").get(payment.id))
        return getOrder(attempt.order_id);
      if (
        db.prepare("SELECT id FROM payments WHERE attempt_id=?").get(attempt.id)
      )
        fail("This payment attempt is already settled.", 409);
      const o = getOrder(attempt.order_id);
      if (o.mode !== mode || o.paidAmount + attempt.amount > o.total)
        fail("Payment amount does not match the order balance.", 409);
      db.prepare("INSERT INTO payments VALUES(?,?,?)").run(
        payment.id,
        attempt.id,
        attempt.amount,
      );
      db.prepare("UPDATE attempts SET status=? WHERE id=?").run(
        "paid",
        attempt.id,
      );
      if (
        (o.paidAmount === 0 && o.reservedUntil < Date.now()) ||
        o.stage === "cancelled"
      )
        o.needsReview = true;
      o.paidAmount += attempt.amount;
      o.paymentStatus = o.paidAmount === o.total ? "paid" : "partially_paid";
      saveOrder(o);
      return o;
    });
  }
  app.post(
    "/api/webhooks/razorpay",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res, next) => {
      try {
        if (
          mode === "demo" ||
          !verifySignature(
            env.RAZORPAY_WEBHOOK_SECRET,
            req.body,
            req.get("x-razorpay-signature"),
          )
        )
          fail("Invalid webhook signature.", 401);
        const payload = JSON.parse(req.body.toString()),
          eventId = req.get("x-razorpay-event-id");
        if (!eventId || eventId.length > 200) fail("Missing webhook event ID.");
        if (db.prepare("SELECT id FROM events WHERE id=?").get(eventId))
          return res.json({ received: true, duplicate: true });
        const payment = payload.payload?.payment?.entity;
        if (
          ["payment.captured", "order.paid"].includes(payload.event) &&
          payment
        ) {
          const attempt = db
            .prepare("SELECT * FROM attempts WHERE provider_id=?")
            .get(payment.order_id);
          if (!attempt) fail("Unknown payment order.", 409);
          capture(attempt, payment);
          db.prepare("INSERT OR IGNORE INTO events VALUES(?,?)").run(
            eventId,
            new Date().toISOString(),
          );
          await sendEmail(attempt.order_id);
        } else if (
          ["payment.failed", "payment.authorized"].includes(payload.event) &&
          payment
        ) {
          const a = db
            .prepare("SELECT * FROM attempts WHERE provider_id=?")
            .get(payment.order_id);
          if (a) {
            const o = getOrder(a.order_id);
            if (o.paidAmount === 0) {
              o.paymentStatus =
                payload.event === "payment.failed" ? "failed" : "pending";
              saveOrder(o);
            }
          }
          db.prepare("INSERT OR IGNORE INTO events VALUES(?,?)").run(
            eventId,
            new Date().toISOString(),
          );
        } else
          db.prepare("INSERT OR IGNORE INTO events VALUES(?,?)").run(
            eventId,
            new Date().toISOString(),
          );
        res.json({ received: true });
      } catch (e) {
        next(e);
      }
    },
  );
  app.use(express.json({ limit: "128kb" }));
  const admin = (req, res, next) => {
    try {
      const cookie = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("vs_admin="))
        ?.slice(9);
      const session =
        cookie &&
        db
          .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
          .get(hash(cookie), Date.now());
      if (!session) fail("Please sign in as the baker.", 401);
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !safeEqual(req.get("x-csrf-token") || "", session.csrf)
      )
        fail("Invalid CSRF token.", 403);
      req.session = session;
      next();
    } catch (e) {
      next(e);
    }
  };
  app.get("/api/health", (req, res) => res.json({ ok: true, mode }));
  app.get("/api/catalog", (req, res) => {
    const settings = getSettings(),
      products = db
        .prepare("SELECT data FROM products")
        .all()
        .map((r) => JSON.parse(r.data))
        .filter((p) => p.active);
    res.json({
      settings,
      products,
      mode,
      today: todayIndia(),
      earliest: addDays(todayIndia(), settings.leadDays),
      latest: addDays(todayIndia(), 90),
    });
  });
  app.get("/api/availability", (req, res) => {
    const s = getSettings(),
      orders = db
        .prepare("SELECT data FROM orders")
        .all()
        .map((r) => JSON.parse(r.data))
        .filter(held),
      dates = [];
    for (let i = s.leadDays; i <= 90; i++) {
      const date = addDays(todayIndia(), i);
      if (
        !s.blockedDates.includes(date) &&
        orders.filter((o) => o.date === date).length < s.dailyCapacity
      )
        dates.push(date);
    }
    res.json({ dates });
  });
  app.post("/api/checkout/preview", (req, res) =>
    res.json(priceCart(db, getSettings(), req.body, { live: mode === "live" })),
  );
  app.post("/api/orders", (req, res) => {
    const idem = z.string().uuid().parse(req.get("idempotency-key")),
      fingerprint = hash(JSON.stringify(req.body));
    const o = transaction(db, () => {
      const existing = db
        .prepare("SELECT * FROM orders WHERE idem=?")
        .get(idem);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          fail("Idempotency key reused for a different order.", 409);
        return JSON.parse(existing.data);
      }
      const priced = priceCart(db, getSettings(), req.body, {
          live: mode === "live",
        }),
        order = {
          ...priced,
          id: id(),
          mode,
          stage: "received",
          paymentStatus: mode === "demo" ? "demo_unpaid" : "pending",
          paidAmount: 0,
          reservedUntil: Date.now() + 20 * 60000,
          created: new Date().toISOString(),
          needsReview: false,
        };
      db.prepare("INSERT INTO orders VALUES(?,?,?,?,?)").run(
        order.id,
        idem,
        fingerprint,
        JSON.stringify(order),
        order.created,
      );
      return order;
    });
    res.status(201).json({ order: o, token: token(o.id) });
  });
  app.get("/api/orders/:id", (req, res) => {
    const o = authorizeOrder(req);
    res.json({
      order: o,
      attempts: db
        .prepare(
          "SELECT id,provider_id,amount,status FROM attempts WHERE order_id=?",
        )
        .all(o.id),
    });
  });
  const inflight = new Set();
  app.post("/api/orders/:id/payment", async (req, res, next) => {
    let locked = false;
    try {
      let o = authorizeOrder(req);
      if (inflight.has(o.id))
        fail("Payment is already being prepared. Try again shortly.", 409);
      inflight.add(o.id);
      locked = true;
      if (o.stage === "cancelled") fail("This order is cancelled.");
      if (o.mode !== mode)
        fail("Payment mode changed; contact the baker.", 409);
      if (mode === "demo")
        return res.json({
          demo: true,
          message: "Demo checkout only. No payment has been taken.",
          order: o,
        });
      if (
        mode === "live" &&
        (!getSettings().businessReviewed || !getSettings().policiesReviewed)
      )
        fail("Live payments paused pending business review.", 503);
      if (o.paidAmount >= o.total) fail("Order already paid.", 409);
      if (o.paidAmount === 0) {
        if (o.reservedUntil < Date.now())
          fail("Your reservation expired. Please create a new order.", 409);
        validateDate(db, getSettings(), o.date, o.id);
      }
      const amount =
        o.paidAmount === 0 && o.depositAmount
          ? o.depositAmount
          : o.total - o.paidAmount;
      let attempt = db
        .prepare(
          "SELECT * FROM attempts WHERE order_id=? AND status='pending' ORDER BY created DESC",
        )
        .get(o.id);
      if (!attempt) {
        if (
          db
            .prepare(
              "SELECT id FROM attempts WHERE order_id=? AND status IN ('creating','creation_unknown')",
            )
            .get(o.id)
        )
          fail(
            "A previous payment-order request needs reconciliation. Contact the baker before retrying.",
            409,
          );
        const aid = id();
        db.prepare("INSERT INTO attempts VALUES(?,?,NULL,?,?,?)").run(
          aid,
          o.id,
          amount,
          "creating",
          new Date().toISOString(),
        );
        let rp;
        try {
          rp = await provider.create(amount, aid);
        } catch (e) {
          db.prepare("UPDATE attempts SET status=? WHERE id=?").run(
            "creation_unknown",
            aid,
          );
          fail(
            "Payment provider unavailable. No payment was taken here. Retry shortly.",
            502,
          );
        }
        if (rp.amount !== amount || rp.currency !== "INR")
          fail("Unexpected payment order response.", 502);
        db.prepare("UPDATE attempts SET provider_id=?,status=? WHERE id=?").run(
          rp.id,
          "pending",
          aid,
        );
        attempt = db.prepare("SELECT * FROM attempts WHERE id=?").get(aid);
      }
      res.json({
        key: env.RAZORPAY_KEY_ID,
        providerOrderId: attempt.provider_id,
        amount: attempt.amount,
        currency: "INR",
        mode,
        customer: o.customer,
      });
    } catch (e) {
      next(e);
    } finally {
      if (locked) inflight.delete(req.params.id);
    }
  });
  app.post("/api/orders/:id/verify", async (req, res, next) => {
    try {
      const o = authorizeOrder(req);
      if (mode === "demo") fail("Demo checkout cannot verify a real payment.");
      const b = z
        .object({
          razorpay_order_id: z.string().max(100),
          razorpay_payment_id: z.string().max(100),
          razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(req.body);
      const a = db
        .prepare("SELECT * FROM attempts WHERE provider_id=? AND order_id=?")
        .get(b.razorpay_order_id, o.id);
      if (
        !a ||
        !verifySignature(
          env.RAZORPAY_KEY_SECRET,
          b.razorpay_order_id + "|" + b.razorpay_payment_id,
          b.razorpay_signature,
        )
      )
        fail("Payment signature verification failed.", 401);
      const payment = await provider.payment(b.razorpay_payment_id);
      if (payment.status === "authorized")
        return res.status(202).json({
          pending: true,
          message:
            "Payment authorised; waiting for capture. Your order is not yet paid.",
        });
      const verified = capture(a, payment);
      await sendEmail(o.id);
      res.json({ order: verified });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/orders/:id/payment-dismissed", (req, res) => {
    const o = authorizeOrder(req);
    if (!o.paidAmount) {
      o.paymentStatus = o.mode === "demo" ? "demo_unpaid" : "pending";
      saveOrder(o);
    }
    res.json({
      message:
        "Payment not confirmed. A later verified capture will update the order.",
    });
  });
  const uploads = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  });
  function saveImage(file, folder) {
    if (!file) return null;
    const b = file.buffer;
    let ext;
    if (b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ext = "jpg";
    else if (
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      ext = "png";
    else if (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    )
      ext = "webp";
    else fail("Upload a JPEG, PNG or WebP image.");
    mkdirSync(path.join(dataDir, folder), { recursive: true, mode: 0o700 });
    const name = id() + "." + ext;
    writeFileSync(path.join(dataDir, folder, name), b, { mode: 0o600 });
    return name;
  }
  app.post("/api/enquiries", uploads.single("reference"), (req, res) => {
    const input = z
      .object({
        occasion: z.string().trim().min(2).max(100),
        servings: z.coerce.number().int().min(1).max(1000),
        flavour: z.string().trim().min(2).max(100),
        budget: z.coerce.number().min(100).max(1000000),
        date: dateSchema,
        message: z.string().trim().max(2000),
        name: z.string().trim().min(2).max(100),
        phone: z.string().regex(/^[6-9]\d{9}$/),
        email: z.union([z.email(), z.literal("")]).optional(),
      })
      .parse(req.body);
    if (
      input.date < addDays(todayIndia(), getSettings().leadDays) ||
      input.date > addDays(todayIndia(), 90)
    )
      fail("Choose a date within the order window.");
    const token = crypto.randomBytes(32).toString("hex"),
      eid = id(),
      reference = saveImage(req.file, "references"),
      data = {
        ...input,
        id: eid,
        status: "awaiting_review",
        reference,
        quote: null,
        orderId: null,
      };
    db.prepare("INSERT INTO enquiries VALUES(?,?,?,?)").run(
      eid,
      hash(token),
      JSON.stringify(data),
      new Date().toISOString(),
    );
    res.status(201).json({
      id: eid,
      token,
      message:
        "Enquiry received. No payment is requested until the baker reviews and quotes.",
    });
  });
  const getEnquiry = (req) => {
    const r = db
      .prepare("SELECT data FROM enquiries WHERE token_hash=?")
      .get(hash(req.get("x-enquiry-token") || ""));
    if (!r) fail("Enquiry access denied.", 403);
    return JSON.parse(r.data);
  };
  app.get("/api/quote", (req, res) => {
    const e = getEnquiry(req);
    res.json({
      enquiry: { ...e, reference: undefined },
      orderToken: e.orderId ? token(e.orderId) : undefined,
    });
  });
  app.post("/api/quote/accept", (req, res) => {
    const e = getEnquiry(req);
    if (e.orderId)
      return res.json({ order: getOrder(e.orderId), token: token(e.orderId) });
    if (!e.quote || e.quote.expires < Date.now())
      fail("Quote is unavailable or expired.");
    if (
      mode === "live" &&
      (!getSettings().businessReviewed || !getSettings().policiesReviewed)
    )
      fail("Live ordering is not yet enabled.", 503);
    const input = z
        .object({
          customer: customerSchema,
          method: z.enum(["pickup", "delivery"]),
        })
        .parse(req.body),
      s = getSettings();
    if (input.method !== e.quote.method)
      fail("Fulfilment method must match the agreed quote.");
    if (input.method === "delivery") {
      if (
        input.customer.address.length < 10 ||
        !s.deliveryAreas.some((a) =>
          a.pincodes.includes(input.customer.pincode),
        )
      )
        fail("Enter an address in an available delivery area.");
    } else if (!s.pickupEnabled) fail("Pickup is unavailable.");
    const o = transaction(db, () => {
      validateDate(db, s, e.quote.date);
      const order = {
        id: id(),
        items: [
          {
            productId: "custom",
            name: e.quote.description,
            quantity: 1,
            unitPrice: e.quote.amount,
            lineTotal: e.quote.amount,
            size: `${e.servings} servings`,
            flavour: e.flavour,
            message: e.message,
          },
        ],
        customer: input.customer,
        method: input.method,
        date: e.quote.date,
        subtotal: e.quote.amount,
        deliveryFee: e.quote.deliveryFee,
        total: e.quote.amount + e.quote.deliveryFee,
        depositAmount: e.quote.depositAmount,
        paidAmount: 0,
        currency: "INR",
        mode,
        stage: "received",
        paymentStatus: mode === "demo" ? "demo_unpaid" : "pending",
        reservedUntil: Date.now() + 20 * 60000,
        created: new Date().toISOString(),
        enquiryId: e.id,
      };
      db.prepare("INSERT INTO orders VALUES(?,?,?,?,?)").run(
        order.id,
        "quote:" + e.id,
        hash(JSON.stringify(input)),
        JSON.stringify(order),
        order.created,
      );
      e.orderId = order.id;
      e.status = "quote_accepted";
      db.prepare("UPDATE enquiries SET data=? WHERE id=?").run(
        JSON.stringify(e),
        e.id,
      );
      return order;
    });
    res.json({ order: o, token: token(o.id) });
  });
  app.post("/api/admin/login", (req, res) => {
    const b = z
      .object({ username: z.string().max(100), password: z.string().max(256) })
      .parse(req.body);
    if (!env.ADMIN_PASSWORD_HASH)
      fail(
        "Administrator access is not configured. Follow the setup guide.",
        503,
      );
    if (
      !safeEqual(b.username, env.ADMIN_USERNAME || "baker") ||
      !passwordValid(b.password, env.ADMIN_PASSWORD_HASH)
    )
      fail("Incorrect username or password.", 401);
    const value = crypto.randomBytes(32).toString("hex"),
      csrf = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(value),
      csrf,
      Date.now() + 8 * 3600000,
    );
    res.cookie("vs_admin", value, {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "strict",
      path: "/api/admin",
      maxAge: 8 * 3600000,
    });
    res.json({ csrf });
  });
  app.get("/api/admin/session", admin, (req, res) =>
    res.json({ csrf: req.session.csrf }),
  );
  app.post("/api/admin/logout", admin, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE hash=?").run(req.session.hash);
    res.clearCookie("vs_admin", { path: "/api/admin" });
    res.json({ ok: true });
  });
  app.get("/api/admin/data", admin, (req, res) =>
    res.json({
      products: db
        .prepare("SELECT data FROM products")
        .all()
        .map((r) => JSON.parse(r.data)),
      settings: getSettings(),
      orders: db
        .prepare("SELECT data FROM orders ORDER BY created DESC")
        .all()
        .map((r) => JSON.parse(r.data)),
      enquiries: db
        .prepare("SELECT data FROM enquiries ORDER BY created DESC")
        .all()
        .map((r) => JSON.parse(r.data)),
      outbox: db.prepare("SELECT * FROM outbox").all(),
      mode,
    }),
  );
  app.put("/api/admin/settings", admin, (req, res) => {
    const s = settingsSchema.parse(req.body);
    if (new Set(s.categories).size !== s.categories.length)
      fail("Category names must be unique.");
    db.prepare("UPDATE settings SET data=? WHERE id=1").run(JSON.stringify(s));
    res.json(s);
  });
  app.put("/api/admin/products/:id", admin, (req, res) => {
    const p = productSchema.parse({ ...req.body, id: req.params.id });
    if (!getSettings().categories.includes(p.category))
      fail("Add this category in settings first.");
    db.prepare(
      "INSERT INTO products VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(p.id, JSON.stringify(p));
    res.json(p);
  });
  app.post("/api/admin/images", admin, uploads.single("image"), (req, res) => {
    if (!req.file) fail("Choose an image.");
    res.json({ path: "/media/" + saveImage(req.file, "media") });
  });
  app.get("/media/:name", (req, res) => {
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(req.params.name))
      return res.sendStatus(404);
    res.sendFile(path.join(dataDir, "media", req.params.name));
  });
  app.get("/api/admin/references/:id", admin, (req, res) => {
    const r = db
      .prepare("SELECT data FROM enquiries WHERE id=?")
      .get(req.params.id);
    if (!r) fail("Not found", 404);
    const e = JSON.parse(r.data);
    if (!e.reference) fail("No reference image", 404);
    res.sendFile(path.join(dataDir, "references", e.reference));
  });
  app.patch("/api/admin/orders/:id", admin, (req, res) => {
    const stage = z
      .enum([
        "received",
        "accepted",
        "baking",
        "ready",
        "completed",
        "cancelled",
      ])
      .parse(req.body.stage);
    const o = getOrder(req.params.id);
    o.stage = stage;
    if (stage === "cancelled") o.reservedUntil = 0;
    saveOrder(o);
    res.json({
      order: o,
      message:
        stage === "cancelled" && o.paidAmount
          ? "Fulfilment cancelled. Any refund must be processed separately in Razorpay."
          : undefined,
    });
  });
  app.post("/api/admin/orders/:id/email", admin, async (req, res) => {
    getOrder(req.params.id);
    await sendEmail(req.params.id);
    res.json({
      outbox: db
        .prepare("SELECT * FROM outbox WHERE order_id=?")
        .all(req.params.id),
    });
  });
  app.post("/api/admin/enquiries/:id/quote", admin, (req, res) => {
    const r = db
      .prepare("SELECT data FROM enquiries WHERE id=?")
      .get(req.params.id);
    if (!r) fail("Enquiry not found.", 404);
    const e = JSON.parse(r.data);
    if (e.orderId) fail("Accepted quotes cannot be edited.");
    const q = z
      .object({
        description: z.string().min(5).max(1500),
        amount: z.number().int().min(100).max(10000000),
        depositAmount: z.number().int().min(100),
        deliveryFee: z.number().int().min(0).max(1000000),
        method: z.enum(["pickup", "delivery"]),
        date: dateSchema,
        validDays: z.number().int().min(1).max(30),
      })
      .parse(req.body);
    if (q.depositAmount > q.amount + q.deliveryFee)
      fail("Deposit cannot exceed total.");
    validateDate(db, getSettings(), q.date);
    e.quote = { ...q, expires: Date.now() + q.validDays * 86400000 };
    e.status = "quoted";
    db.prepare("UPDATE enquiries SET data=? WHERE id=?").run(
      JSON.stringify(e),
      e.id,
    );
    res.json({
      enquiry: e,
      message:
        "Quote saved. Customer can review it using their private enquiry link.",
    });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (err instanceof multer.MulterError)
      return res.status(400).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "Images must be 5 MB or smaller."
            : "Invalid image upload.",
      });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON request." });
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "The request could not be completed. Please try again.",
    });
  });
  return { app, db, getOrder, token, mode };
}
