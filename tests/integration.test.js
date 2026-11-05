import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { passwordHash, addDays, todayIndia } from "../server/domain.js";
const signature = (secret, body) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");
async function fixture(mode = "demo", providerOverride) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "velvet-test-")),
    env = {
      PAYMENT_MODE: mode,
      ADMIN_USERNAME: "baker",
      ADMIN_PASSWORD_HASH: passwordHash("test-password-strong"),
      APP_ORIGIN: "http://localhost:3000",
      SESSION_SECRET: "test-session-secret-at-least-32-characters",
      RAZORPAY_KEY_ID: "rzp_test_fake",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
    };
  let calls = 0;
  const provider = providerOverride || {
    async create(amount) {
      return { id: "order_" + ++calls, amount, currency: "INR" };
    },
    async payment(id) {
      return {
        id,
        order_id: "order_1",
        amount: 65000,
        currency: "INR",
        status: "captured",
        captured: true,
      };
    },
  };
  const instance = createApp({ dataDir: directory, env, provider });
  const server = await new Promise((resolve) => {
    const s = instance.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  async function request(url, body, headers = {}, method) {
    const r = await fetch(base + "/api" + url, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  }
  return {
    ...instance,
    directory,
    request,
    base,
    async close() {
      await new Promise((r) => server.close(r));
      instance.db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
const input = () => ({
  items: [
    {
      productId: "tres-leches",
      size: "Standard",
      flavour: "Velvet Milk",
      quantity: 1,
      message: "",
    },
  ],
  method: "pickup",
  date: addDays(todayIndia(), 3),
  customer: {
    name: "Test Customer",
    phone: "9876543210",
    email: "",
    address: "",
    pincode: "",
    instructions: "",
  },
});
const admin = async (f) => {
  const r = await f.request("/admin/login", {
    username: "baker",
    password: "test-password-strong",
  });
  assert.equal(r.status, 200);
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    "x-csrf-token": r.body.csrf,
  };
};
const create = async (f, body = input(), key = crypto.randomUUID()) => {
  const r = await f.request("/orders", body, { "idempotency-key": key });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
};
test("trusted customization totals, delivery validation, date restrictions and stock are enforced", async () => {
  const f = await fixture();
  try {
    const i = input();
    i.items[0].message = "Happy birthday";
    i.items[0].size = "Sharing";
    i.items[0].quantity = 2;
    i.total = 1;
    i.items[0].price = 1;
    let r = await f.request("/checkout/preview", i);
    assert.equal(r.body.total, (65000 + 18000 + 3000) * 2);
    i.method = "delivery";
    r = await f.request("/checkout/preview", i);
    assert.equal(r.status, 400);
    i.customer.address = "12 Example Road, Town";
    i.customer.pincode = "622001";
    r = await f.request("/checkout/preview", i);
    assert.equal(r.body.deliveryFee, 6000);
    assert.equal(r.body.total, 178000);
    i.customer.pincode = "999999";
    assert.equal((await f.request("/checkout/preview", i)).status, 400);
    i.method = "pickup";
    i.date = todayIndia();
    assert.equal((await f.request("/checkout/preview", i)).status, 400);
    i.date = "2027-02-30";
    assert.equal((await f.request("/checkout/preview", i)).status, 400);
    const h = await admin(f),
      p = JSON.parse(
        f.db.prepare("SELECT data FROM products WHERE id='tres-leches'").get()
          .data,
      );
    p.stock = 0;
    assert.equal(
      (await f.request("/admin/products/" + p.id, p, h, "PUT")).status,
      200,
    );
    assert.equal((await f.request("/checkout/preview", input())).status, 400);
  } finally {
    await f.close();
  }
});
test("idempotent order creation, private guest access, daily capacity, and persistent demo-unpaid status", async () => {
  const f = await fixture();
  try {
    const h = await admin(f),
      s = JSON.parse(f.db.prepare("SELECT data FROM settings").get().data);
    s.dailyCapacity = 1;
    await f.request("/admin/settings", s, h, "PUT");
    const key = crypto.randomUUID(),
      one = await create(f, input(), key),
      two = await create(f, input(), key);
    assert.equal(one.order.id, two.order.id);
    assert.equal(one.token, two.token);
    const diff = input();
    diff.items[0].quantity = 2;
    assert.equal(
      (await f.request("/orders", diff, { "idempotency-key": key })).status,
      409,
    );
    assert.equal(
      (
        await f.request("/orders", input(), {
          "idempotency-key": crypto.randomUUID(),
        })
      ).status,
      400,
    );
    assert.equal((await f.request("/orders/" + one.order.id)).status, 403);
    const auth = { "x-order-token": one.token };
    assert.equal(
      (await f.request("/orders/" + one.order.id, undefined, auth)).body.order
        .paymentStatus,
      "demo_unpaid",
    );
    const pay = await f.request(
      "/orders/" + one.order.id + "/payment",
      {},
      auth,
    );
    assert.equal(pay.body.demo, true);
    assert.equal(f.getOrder(one.order.id).paidAmount, 0);
    const other = openAgain(f);
    assert.equal(other.paymentStatus, "demo_unpaid");
  } finally {
    await f.close();
  }
});
function openAgain(f) {
  return JSON.parse(f.db.prepare("SELECT data FROM orders LIMIT 1").get().data);
}
test("admin login, CSRF, cross-origin rejection and separate fulfilment state", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request("/admin/data")).status, 401);
    assert.equal(
      (
        await f.request("/admin/login", {
          username: "baker",
          password: "wrong",
        })
      ).status,
      401,
    );
    const h = await admin(f);
    assert.match(h.cookie, /vs_admin=/);
    const o = await create(f);
    assert.equal(
      (
        await f.request(
          "/admin/orders/" + o.order.id,
          { stage: "baking" },
          { cookie: h.cookie },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          "/admin/orders/" + o.order.id,
          { stage: "baking" },
          { ...h, origin: "https://evil.example" },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          "/admin/orders/" + o.order.id,
          { stage: "baking" },
          h,
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(f.getOrder(o.order.id).paymentStatus, "demo_unpaid");
    await f.request("/admin/logout", {}, h);
    assert.equal((await f.request("/admin/data", undefined, h)).status, 401);
  } finally {
    await f.close();
  }
});
test("Razorpay browser verification rejects forgery, checks captured payment, and handles duplicate webhook processing", async () => {
  const f = await fixture("test");
  try {
    const o = await create(f),
      auth = { "x-order-token": o.token };
    const p = await f.request("/orders/" + o.order.id + "/payment", {}, auth);
    assert.equal(p.body.amount, 65000);
    const again = await f.request(
      "/orders/" + o.order.id + "/payment",
      {},
      auth,
    );
    assert.equal(p.body.providerOrderId, again.body.providerOrderId);
    const body = {
      razorpay_order_id: p.body.providerOrderId,
      razorpay_payment_id: "pay_123",
      razorpay_signature: "0".repeat(64),
    };
    assert.equal(
      (await f.request("/orders/" + o.order.id + "/verify", body, auth)).status,
      401,
    );
    body.razorpay_signature = signature(
      "secret",
      body.razorpay_order_id + "|" + body.razorpay_payment_id,
    );
    let r = await f.request("/orders/" + o.order.id + "/verify", body, auth);
    assert.equal(r.body.order.paymentStatus, "paid");
    assert.equal(r.body.order.mode, "test");
    r = await f.request("/orders/" + o.order.id + "/verify", body, auth);
    assert.equal(r.body.order.paidAmount, 65000);
    const payload = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_123",
            order_id: p.body.providerOrderId,
            amount: 65000,
            currency: "INR",
            status: "captured",
            captured: true,
          },
        },
      },
    });
    async function hook(sig, event = "evt_1") {
      const r = await fetch(f.base + "/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": sig,
          "x-razorpay-event-id": event,
        },
        body: payload,
      });
      return { status: r.status, body: await r.json() };
    }
    assert.equal((await hook("bad")).status, 401);
    assert.equal(
      (await hook(signature("webhook-secret", payload))).status,
      200,
    );
    assert.equal(
      (await hook(signature("webhook-secret", payload))).body.duplicate,
      true,
    );
    assert.equal(f.db.prepare("SELECT count(*) n FROM payments").get().n, 1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM events").get().n, 1);
  } finally {
    await f.close();
  }
});
test("authorised payment remains pending and mismatched captured amount is rejected", async () => {
  let status = "authorized";
  const f = await fixture("test", {
    async create(amount) {
      return { id: "order_1", amount, currency: "INR" };
    },
    async payment(id) {
      return {
        id,
        order_id: "order_1",
        amount: 1,
        currency: "INR",
        status,
        captured: status === "captured",
      };
    },
  });
  try {
    const o = await create(f),
      auth = { "x-order-token": o.token };
    await f.request("/orders/" + o.order.id + "/payment", {}, auth);
    const body = {
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_123",
      razorpay_signature: signature("secret", "order_1|pay_123"),
    };
    assert.equal(
      (await f.request("/orders/" + o.order.id + "/verify", body, auth)).status,
      202,
    );
    assert.equal(f.getOrder(o.order.id).paidAmount, 0);
    status = "captured";
    assert.equal(
      (await f.request("/orders/" + o.order.id + "/verify", body, auth)).status,
      409,
    );
    assert.equal(f.getOrder(o.order.id).paidAmount, 0);
  } finally {
    await f.close();
  }
});
test("custom enquiries require review; private quote supports deposit and immutable acceptance", async () => {
  const f = await fixture();
  try {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      occasion: "Birthday",
      servings: "10",
      flavour: "Chocolate",
      budget: "1500",
      date: addDays(todayIndia(), 5),
      message: "Pink flowers",
      name: "Test Customer",
      phone: "9876543210",
      email: "",
    }))
      form.append(k, v);
    const response = await fetch(f.base + "/api/enquiries", {
      method: "POST",
      body: form,
    });
    assert.equal(response.status, 201);
    const e = await response.json(),
      headers = { "x-enquiry-token": e.token };
    assert.equal((await f.request("/quote")).status, 403);
    assert.equal(
      (
        await f.request(
          "/quote/accept",
          { customer: input().customer, method: "pickup" },
          headers,
        )
      ).status,
      400,
    );
    const h = await admin(f);
    const q = {
      description: "Chocolate cake with pink flowers; 10 servings",
      amount: 150000,
      depositAmount: 60000,
      deliveryFee: 0,
      method: "pickup",
      date: addDays(todayIndia(), 5),
      validDays: 7,
    };
    assert.equal(
      (await f.request("/admin/enquiries/" + e.id + "/quote", q, h)).status,
      200,
    );
    const accepted = await f.request(
      "/quote/accept",
      { customer: input().customer, method: "pickup" },
      headers,
    );
    assert.equal(accepted.body.order.depositAmount, 60000);
    assert.equal(accepted.body.order.total, 150000);
    assert.equal(accepted.body.order.paidAmount, 0);
    assert.equal(
      (
        await f.request(
          "/quote/accept",
          { customer: input().customer, method: "pickup" },
          headers,
        )
      ).body.order.id,
      accepted.body.order.id,
    );
    assert.equal(
      (await f.request("/admin/enquiries/" + e.id + "/quote", q, h)).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("upload rejects disguised non-image data; administrator files stay private", async () => {
  const f = await fixture();
  try {
    const h = await admin(f),
      form = new FormData();
    form.append(
      "image",
      new Blob(["<script>bad</script>"], { type: "image/jpeg" }),
      "fake.jpg",
    );
    const r = await fetch(f.base + "/api/admin/images", {
      method: "POST",
      headers: h,
      body: form,
    });
    assert.equal(r.status, 400);
    assert.equal((await f.request("/admin/references/unknown")).status, 401);
  } finally {
    await f.close();
  }
});
test("live mode fails closed without matching secrets; reviewed data is required for live ordering", async () => {
  assert.throws(
    () =>
      createApp({
        dataDir: mkdtempSync(path.join(os.tmpdir(), "velvet-live-")),
        env: { PAYMENT_MODE: "live" },
      }),
    /Matching Razorpay/,
  );
  const f = await fixture();
  try {
    const { priceCart } = await import("../server/domain.js");
    const s = JSON.parse(f.db.prepare("SELECT data FROM settings").get().data);
    assert.throws(
      () => priceCart(f.db, s, input(), { live: true }),
      /reviewed/,
    );
  } finally {
    await f.close();
  }
});

test("custom deposit then balance verify separately, retain total and persist to another database connection", async () => {
  let sequence = 0;
  const paymentOrders = new Map();
  const f = await fixture("test", {
    async create(amount) {
      const id = "order_" + ++sequence;
      paymentOrders.set(id, amount);
      return { id, amount, currency: "INR" };
    },
    async payment(id) {
      const number = id.split("_")[1],
        order_id = "order_" + number;
      return {
        id,
        order_id,
        amount: paymentOrders.get(order_id),
        currency: "INR",
        status: "captured",
        captured: true,
      };
    },
  });
  try {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      occasion: "Birthday",
      servings: "10",
      flavour: "Chocolate",
      budget: "1500",
      date: addDays(todayIndia(), 5),
      message: "Test cake",
      name: "Deposit Test",
      phone: "9876543210",
      email: "",
    }))
      form.append(k, v);
    const er = await fetch(f.base + "/api/enquiries", {
      method: "POST",
      body: form,
    });
    const e = await er.json(),
      h = await admin(f);
    await f.request(
      "/admin/enquiries/" + e.id + "/quote",
      {
        description: "Custom cake agreed for testing",
        amount: 150000,
        depositAmount: 60000,
        deliveryFee: 0,
        method: "pickup",
        date: addDays(todayIndia(), 5),
        validDays: 7,
      },
      h,
    );
    const r = await f.request(
      "/quote/accept",
      { customer: input().customer, method: "pickup" },
      { "x-enquiry-token": e.token },
    );
    const o = r.body.order,
      auth = { "x-order-token": r.body.token };
    async function pay(expected) {
      const p = await f.request("/orders/" + o.id + "/payment", {}, auth);
      assert.equal(p.body.amount, expected);
      const pid = "pay_" + p.body.providerOrderId.split("_")[1];
      const verified = await f.request(
        "/orders/" + o.id + "/verify",
        {
          razorpay_order_id: p.body.providerOrderId,
          razorpay_payment_id: pid,
          razorpay_signature: signature(
            "secret",
            p.body.providerOrderId + "|" + pid,
          ),
        },
        auth,
      );
      assert.equal(verified.status, 200);
      return verified.body.order;
    }
    const first = await pay(60000);
    assert.equal(first.paymentStatus, "partially_paid");
    assert.equal(first.total - first.paidAmount, 90000);
    const last = await pay(90000);
    assert.equal(last.paymentStatus, "paid");
    assert.equal(last.paidAmount, 150000);
    assert.equal(f.db.prepare("SELECT count(*) n FROM payments").get().n, 2);
    assert.equal(
      (await f.request("/orders/" + o.id + "/payment", {}, auth)).status,
      409,
    );
    const { openDb } = await import("../server/db.js");
    const other = openDb(f.directory);
    try {
      assert.equal(
        JSON.parse(
          other.prepare("SELECT data FROM orders WHERE id=?").get(o.id).data,
        ).paidAmount,
        150000,
      );
    } finally {
      other.close();
    }
  } finally {
    await f.close();
  }
});

test("unknown provider order creation blocks retries and expired reservations cannot begin payment", async () => {
  let calls = 0;
  const f = await fixture("test", {
    async create() {
      calls++;
      throw Error("network timeout");
    },
  });
  try {
    const o = await create(f),
      auth = { "x-order-token": o.token };
    assert.equal(
      (await f.request("/orders/" + o.order.id + "/payment", {}, auth)).status,
      502,
    );
    assert.equal(
      (await f.request("/orders/" + o.order.id + "/payment", {}, auth)).status,
      409,
    );
    assert.equal(calls, 1);
    const next = input();
    next.date = addDays(todayIndia(), 8);
    const other = await create(f, next),
      expired = { ...other.order, reservedUntil: Date.now() - 1 };
    f.db
      .prepare("UPDATE orders SET data=? WHERE id=?")
      .run(JSON.stringify(expired), expired.id);
    assert.equal(
      (
        await f.request(
          "/orders/" + expired.id + "/payment",
          {},
          { "x-order-token": other.token },
        )
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});
