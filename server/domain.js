import crypto from "node:crypto";
import { z } from "zod";
export const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
export const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return (
    first.length === second.length && crypto.timingSafeEqual(first, second)
  );
};
export const todayIndia = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const addDays = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (x) =>
      !Number.isNaN(Date.parse(x)) &&
      new Date(x).toISOString().slice(0, 10) === x,
    "Invalid date",
  );
export const customerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  email: z.union([z.email(), z.literal("")]).optional(),
  address: z.string().trim().max(500).default(""),
  pincode: z.string().max(6).default(""),
  instructions: z.string().trim().max(500).default(""),
});
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().max(60),
        size: z.string().max(60),
        flavour: z.string().max(60),
        message: z.string().trim().max(80).default(""),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  method: z.enum(["pickup", "delivery"]),
  date: dateSchema,
  customer: customerSchema,
});
export const settingsSchema = z.object({
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  whatsapp: z.string().regex(/^$|^91[6-9]\d{9}$/),
  deliveryAreas: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        pincodes: z
          .array(z.string().regex(/^\d{6}$/))
          .min(1)
          .max(100),
        fee: z.number().int().min(0).max(1000000),
      }),
    )
    .max(30),
  minimumOrder: z.number().int().min(0).max(10000000),
  leadDays: z.number().int().min(1).max(90),
  dailyCapacity: z.number().int().min(1).max(1000),
  blockedDates: z.array(dateSchema).max(366),
  pickupEnabled: z.boolean(),
  pickupAddress: z.string().min(1).max(500),
  businessReviewed: z.boolean(),
  policiesReviewed: z.boolean(),
  currency: z.literal("INR"),
});
export const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(60),
  description: z.string().min(1).max(1500),
  image: z
    .string()
    .regex(
      /^(milk|brownie|biscoff|rose|coconut|chocolate|\/media\/[a-f0-9-]+\.(jpg|png|webp))$/,
    ),
  price: z.number().int().min(100).max(10000000),
  active: z.boolean(),
  reviewed: z.boolean(),
  stock: z.number().int().min(0).max(10000).nullable(),
  unavailableDates: z.array(dateSchema).max(366),
  ingredients: z.string().min(1).max(1500),
  allergens: z.string().min(1).max(1500),
  portion: z.string().min(1).max(200),
  sizes: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        extra: z.number().int().min(0).max(10000000),
      }),
    )
    .min(1)
    .max(10),
  flavours: z.array(z.string().min(1).max(60)).min(1).max(20),
  customizationPrice: z.number().int().min(0).max(1000000),
});
export function held(order) {
  return (
    order.stage !== "cancelled" &&
    (order.paidAmount > 0 || order.reservedUntil > Date.now())
  );
}
export function validateDate(db, settings, date, excludeId) {
  const min = addDays(todayIndia(), settings.leadDays);
  if (
    date < min ||
    date > addDays(todayIndia(), 90) ||
    settings.blockedDates.includes(date)
  )
    fail("That date is unavailable. Please choose another date.");
  const count = db
    .prepare("SELECT data FROM orders")
    .all()
    .map((r) => JSON.parse(r.data))
    .filter((o) => o.id !== excludeId && o.date === date && held(o)).length;
  if (count >= settings.dailyCapacity)
    fail("The baker is fully booked on that date.");
}
export function priceCart(db, settings, input, { live = false } = {}) {
  const order = checkoutSchema.parse(input);
  validateDate(db, settings, order.date);
  if (live && (!settings.businessReviewed || !settings.policiesReviewed))
    fail(
      "Live ordering is paused until business details and policies are reviewed.",
      503,
    );
  const quantities = {};
  for (const i of order.items)
    quantities[i.productId] = (quantities[i.productId] || 0) + i.quantity;
  const heldOrders = db
    .prepare("SELECT data FROM orders")
    .all()
    .map((r) => JSON.parse(r.data))
    .filter(held);
  const items = order.items.map((i) => {
    const row = db
      .prepare("SELECT data FROM products WHERE id=?")
      .get(i.productId);
    if (!row) fail("Product not found.");
    const p = JSON.parse(row.data);
    if (!p.active || p.unavailableDates.includes(order.date))
      fail(`${p.name} is unavailable.`);
    if (live && !p.reviewed) fail(`${p.name} still needs the baker’s review.`);
    const used = heldOrders.reduce(
      (sum, o) =>
        sum +
        o.items
          .filter((x) => x.productId === p.id)
          .reduce((s, x) => s + x.quantity, 0),
      0,
    );
    if (p.stock !== null && quantities[p.id] + used > p.stock)
      fail(`${p.name} is sold out or has insufficient stock.`);
    const size = p.sizes.find((x) => x.name === i.size);
    if (!size || !p.flavours.includes(i.flavour))
      fail("Choose a valid size and flavour.");
    const unitPrice =
      p.price + size.extra + (i.message ? p.customizationPrice : 0);
    return { ...i, name: p.name, unitPrice, lineTotal: unitPrice * i.quantity };
  });
  const subtotal = items.reduce((s, x) => s + x.lineTotal, 0);
  if (subtotal < settings.minimumOrder)
    fail(`Minimum order is ₹${settings.minimumOrder / 100}.`);
  let deliveryFee = 0;
  if (order.method === "pickup" && !settings.pickupEnabled)
    fail("Pickup is currently unavailable.");
  if (order.method === "delivery") {
    if (order.customer.address.length < 10)
      fail("Enter a complete delivery address.");
    const area = settings.deliveryAreas.find((a) =>
      a.pincodes.includes(order.customer.pincode),
    );
    if (!area) fail("Delivery is not available for this pincode.");
    deliveryFee = area.fee;
  }
  return {
    ...order,
    items,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    currency: "INR",
  };
}
export function verifySignature(secret, body, signature) {
  return safeEqual(
    crypto.createHmac("sha256", secret).update(body).digest("hex"),
    signature,
  );
}
export function passwordHash(
  password,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordValid(password, encoded) {
  if (!encoded || password.length > 256) return false;
  const [salt, h] = encoded.split(":");
  return (
    !!salt && !!h && safeEqual(passwordHash(password, salt).split(":")[1], h)
  );
}
