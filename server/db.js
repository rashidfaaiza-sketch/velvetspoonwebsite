import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
export function openDb(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "velvet.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), provider_id TEXT UNIQUE, amount INTEGER NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), amount INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS enquiries(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL, error TEXT);
 `);
  if (!db.prepare("SELECT id FROM settings").get()) {
    db.prepare("INSERT INTO settings VALUES(1,?)").run(
      JSON.stringify({
        categories: [
          "Cakes",
          "Brownies",
          "Cupcakes",
          "Cookies",
          "Seasonal specials",
          "Puddings",
        ],
        whatsapp: "919443249494",
        deliveryAreas: [
          { name: "Pudukkottai — demo zone", pincodes: ["622001"], fee: 6000 },
        ],
        minimumOrder: 25000,
        leadDays: 2,
        dailyCapacity: 8,
        blockedDates: [],
        pickupEnabled: true,
        pickupAddress: "Pickup address to be confirmed by the baker",
        businessReviewed: false,
        policiesReviewed: false,
        currency: "INR",
      }),
    );
    const products = [
      [
        "tres-leches",
        "The Velvet Tres Leches",
        "Cakes",
        "A beautifully soft, milk-soaked cake finished with a luscious layer of cream.",
        "milk",
        65000,
        ["Velvet Milk", "Velvet Rose", "Velvet Royale"],
      ],
      [
        "brownies",
        "Fudgy Chocolate Brownies",
        "Brownies",
        "A crackly top, a fudgy centre, and rich chocolate in every bite.",
        "brownie",
        32000,
        ["Classic chocolate"],
      ],
      [
        "biscoff",
        "Biscoff Bliss",
        "Puddings",
        "Creamy layers with the caramelised crunch of Lotus Biscoff.",
        "biscoff",
        18000,
        ["Biscoff"],
      ],
      [
        "rose",
        "Pink Delight",
        "Puddings",
        "A creamy pudding with delicate, fragrant rose.",
        "rose",
        16000,
        ["Rose"],
      ],
      [
        "coconut",
        "Tropical Luxury",
        "Seasonal specials",
        "Silky tender coconut pudding, delicately sweet and refreshing.",
        "coconut",
        18000,
        ["Tender coconut"],
      ],
      [
        "choco",
        "Choco Crush",
        "Puddings",
        "A little cup of chocolate indulgence, with a rich, velvety texture.",
        "chocolate",
        18000,
        ["Chocolate"],
      ],
    ];
    const insert = db.prepare("INSERT INTO products VALUES(?,?)");
    for (const [
      id,
      name,
      category,
      description,
      image,
      price,
      flavours,
    ] of products)
      insert.run(
        id,
        JSON.stringify({
          id,
          name,
          category,
          description,
          image,
          price,
          active: true,
          reviewed: false,
          stock: null,
          unavailableDates: [],
          ingredients: "Awaiting the baker’s verified ingredient list.",
          allergens:
            "Not yet verified. Please ask the baker before ordering if you have an allergy.",
          portion: "Sample serving — size to be confirmed",
          sizes: [
            { name: "Standard", extra: 0 },
            { name: "Sharing", extra: 18000 },
          ],
          flavours,
          customizationPrice: 3000,
        }),
      );
  }
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
