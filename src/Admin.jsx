import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  LogOut,
  Plus,
  Save,
  ArrowLeft,
  Upload,
  RefreshCw,
} from "lucide-react";
import { api, money } from "./api";
export default function Admin() {
  const [csrf, setCsrf] = useState(""),
    [data, setData] = useState(null),
    [tab, setTab] = useState("Orders"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(null),
    [settings, setSettings] = useState(null);
  async function load() {
    const d = await api("/admin/data");
    setData(d);
    setSettings(d.settings);
  }
  useEffect(() => {
    api("/admin/session")
      .then((r) => {
        setCsrf(r.csrf);
        return load();
      })
      .catch(() => {});
  }, []);
  async function action(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      setNotice(result?.message || "Saved.");
      await load();
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const mutate = (url, body, method = "POST") =>
    api("/admin" + url, { method, headers: { "x-csrf-token": csrf }, body });
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api("/admin/login", {
        method: "POST",
        body: Object.fromEntries(f),
      });
      setCsrf(r.csrf);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!csrf || !data)
    return (
      <section className="section">
        <form className="admin-login panel" onSubmit={login}>
          <p className="eyebrow">THE BAKER’S CORNER</p>
          <h1>Welcome back.</h1>
          <p>A quiet little place to manage your sweet business.</p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <label>
            Username
            <input
              name="username"
              required
              autoComplete="username"
              defaultValue="baker"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              required
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button className="button full" disabled={busy}>
            {busy ? "Signing in…" : "Step into the kitchen"}
            <ArrowRight size={17} />
          </button>
          <p className="small-muted" style={{ marginTop: 20 }}>
            Access requires the administrator credentials configured on the
            server. No default password is provided.
          </p>
        </form>
      </section>
    );
  const newProduct = () =>
    setEditor({
      id: "new-treat",
      name: "New treat",
      category: data.settings.categories[0],
      description: "Add an approved product description.",
      image: "milk",
      price: 10000,
      active: false,
      reviewed: false,
      stock: null,
      unavailableDates: [],
      ingredients: "Add verified ingredients.",
      allergens: "Add verified allergens.",
      portion: "Add portion size.",
      sizes: [{ name: "Standard", extra: 0 }],
      flavours: ["Classic"],
      customizationPrice: 0,
    });
  return (
    <section className="section">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">
            THE BAKER’S CORNER · {data.mode.toUpperCase()} MODE
          </p>
          <h1>A little kitchen control.</h1>
        </div>
        <button
          className="button outline"
          onClick={async () => {
            try {
              await mutate("/logout");
              setCsrf("");
              setData(null);
              setError("");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Sign out
          <LogOut size={15} />
        </button>
      </div>
      <div className="admin-metrics">
        <div>
          Orders<strong>{data.orders.length}</strong>
        </div>
        <div>
          Awaiting review
          <strong>
            {
              data.enquiries.filter((e) => e.status === "awaiting_review")
                .length
            }
          </strong>
        </div>
        <div>
          Verified {data.mode === "test" ? "test " : ""}payments
          <strong>
            {money(data.orders.reduce((s, o) => s + o.paidAmount, 0))}
          </strong>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="admin-layout">
        <nav className="admin-tabs" aria-label="Dashboard sections">
          {["Orders", "Enquiries", "Products", "Settings"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setEditor(null);
              }}
            >
              {t}
            </button>
          ))}
          <button onClick={() => action(load)}>
            <RefreshCw size={13} /> Refresh
          </button>
        </nav>
        <div>
          {tab === "Orders" && (
            <>
              <h2 className="admin-section-title">Orders & fulfilment</h2>
              <p className="small-muted">
                Payment is verified automatically. Changing a fulfilment stage
                never changes payment status or issues refunds.
              </p>
              {!data.orders.length && (
                <div className="empty">
                  <h3>Your next sweet moment starts here.</h3>
                  <p>
                    Orders appear after a customer completes checkout details.
                  </p>
                </div>
              )}
              {data.orders.map((o) => (
                <article className="admin-item" key={o.id}>
                  <h3>
                    {o.customer.name} · {o.date}
                  </h3>
                  <p>Order {o.id}</p>
                  <div className="admin-status">
                    <span>{o.mode}</span>
                    <span>Payment: {o.paymentStatus}</span>
                    <span>Fulfilment: {o.stage}</span>
                  </div>
                  {o.needsReview && (
                    <div className="error">
                      Payment captured after the reservation changed. Check
                      capacity and contact the customer.
                    </div>
                  )}
                  <p>
                    {o.customer.phone}
                    {o.customer.email && ` · ${o.customer.email}`}
                  </p>
                  <p>
                    {o.method}{" "}
                    {o.customer.address &&
                      ` · ${o.customer.address}, ${o.customer.pincode}`}
                  </p>
                  <p>{o.customer.instructions}</p>
                  {o.items.map((i, n) => (
                    <p key={n}>
                      {i.quantity} × {i.name} · {i.size} · {i.flavour}
                      {i.message && ` · “${i.message}”`}
                    </p>
                  ))}
                  <div className="balance-note">
                    Total {money(o.total)} · Verified {money(o.paidAmount)} ·
                    Balance {money(o.total - o.paidAmount)}
                  </div>
                  <label>
                    Fulfilment stage
                    <select
                      aria-label={"Stage for " + o.customer.name}
                      value={o.stage}
                      disabled={busy}
                      onChange={(e) =>
                        action(() =>
                          mutate(
                            "/orders/" + o.id,
                            { stage: e.target.value },
                            "PATCH",
                          ),
                        )
                      }
                    >
                      {[
                        "received",
                        "accepted",
                        "baking",
                        "ready",
                        "completed",
                        "cancelled",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <p className="small-muted">
                    Email:{" "}
                    {data.outbox
                      .filter((x) => x.order_id === o.id)
                      .map((x) => x.status)
                      .join(", ") || "Not sent / not configured"}
                  </p>
                  <button
                    className="text-link"
                    disabled={busy || !o.paidAmount}
                    onClick={() =>
                      action(() => mutate("/orders/" + o.id + "/email"))
                    }
                  >
                    Retry configured confirmation email
                  </button>
                </article>
              ))}
            </>
          )}
          {tab === "Enquiries" && (
            <>
              <h2 className="admin-section-title">
                Ideas waiting to become cake.
              </h2>
              {!data.enquiries.length && (
                <div className="empty">
                  <h3>No enquiries yet.</h3>
                </div>
              )}
              {data.enquiries.map((e) => (
                <Enquiry
                  key={e.id}
                  enquiry={e}
                  disabled={busy}
                  save={(body) =>
                    action(() => mutate("/enquiries/" + e.id + "/quote", body))
                  }
                />
              ))}
            </>
          )}
          {tab === "Products" && (
            <>
              <div className="admin-tools">
                <h2 className="admin-section-title">The menu</h2>
                <button className="button" onClick={newProduct}>
                  <Plus size={16} />
                  Add a treat
                </button>
              </div>
              {editor ? (
                <ProductEditor
                  key={editor.id}
                  initial={editor}
                  categories={data.settings.categories}
                  busy={busy}
                  back={() => setEditor(null)}
                  upload={async (file) => {
                    const f = new FormData();
                    f.append("image", file);
                    return mutate("/images", f);
                  }}
                  save={async (p) => {
                    const r = await action(() =>
                      mutate("/products/" + p.id, p, "PUT"),
                    );
                    if (r) setEditor(null);
                  }}
                />
              ) : (
                <div className="admin-product-list">
                  {data.products.map((p) => (
                    <button key={p.id} onClick={() => setEditor(p)}>
                      <h3>{p.name}</h3>
                      <p>
                        {p.category} · {money(p.price)}
                      </p>
                      <p>
                        {p.active ? "Visible" : "Hidden"} ·{" "}
                        {p.reviewed ? "Reviewed" : "Needs review"} ·{" "}
                        {p.stock === null
                          ? "Unlimited stock"
                          : p.stock + " stock"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "Settings" && settings && (
            <Settings
              initial={settings}
              busy={busy}
              save={(s) => action(() => mutate("/settings", s, "PUT"))}
            />
          )}
        </div>
      </div>
    </section>
  );
}
function JsonField({ label, value, onChange, help }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  return (
    <label>
      {label}
      {help && <span className="small-muted">{help}</span>}
      <textarea
        className="code"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            onChange(parsed);
            setError("");
          } catch {
            setError("Enter valid JSON before saving.");
          }
        }}
      />
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </label>
  );
}
function ProductEditor({ initial, categories, busy, save, back, upload }) {
  const [p, setP] = useState(initial),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [jsonValid, setJsonValid] = useState(true);
  const update = (k, v) => setP({ ...p, [k]: v });
  async function photo(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true);
    setError("");
    try {
      const r = await upload(f);
      update("image", r.path);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form
      className="admin-editor panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (e.currentTarget.querySelector("[role=alert]")) {
          setError("Correct the JSON fields before saving.");
          return;
        }
        save(p);
      }}
    >
      <button className="text-link" type="button" onClick={back}>
        <ArrowLeft size={15} />
        All products
      </button>
      <h2 style={{ marginTop: 25 }}>A lovely little detail.</h2>
      {error && <div className="error">{error}</div>}
      <div className="form-grid">
        <label>
          Product ID
          <input
            required
            pattern="[a-z0-9-]+"
            maxLength={60}
            value={p.id}
            onChange={(e) => update("id", e.target.value)}
            readOnly={initial.id !== "new-treat"}
          />
        </label>
        <label>
          Name
          <input
            required
            value={p.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            value={p.category}
            onChange={(e) => update("category", e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Base price (₹)
          <input
            type="number"
            required
            min={1}
            step="0.01"
            value={p.price / 100}
            onChange={(e) =>
              update("price", Math.round(Number(e.target.value) * 100))
            }
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          required
          value={p.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Portion size
          <input
            required
            value={p.portion}
            onChange={(e) => update("portion", e.target.value)}
          />
        </label>
        <label>
          Message customization fee (₹)
          <input
            type="number"
            min={0}
            step="0.01"
            value={p.customizationPrice / 100}
            onChange={(e) =>
              update(
                "customizationPrice",
                Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
      </div>
      <label>
        Verified ingredients
        <textarea
          required
          value={p.ingredients}
          onChange={(e) => update("ingredients", e.target.value)}
        />
      </label>
      <label>
        Verified allergen information
        <textarea
          required
          value={p.allergens}
          onChange={(e) => update("allergens", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Stock (blank = unlimited)
          <input
            type="number"
            min={0}
            value={p.stock === null ? "" : p.stock}
            onChange={(e) =>
              update(
                "stock",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </label>
        <label>
          Upload product photo <small>JPEG, PNG, WebP · max 5 MB</small>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={photo}
          />
        </label>
      </div>
      <p className="small-muted">Image: {p.image}</p>
      <JsonField
        label="Portions & additional prices (paise)"
        value={p.sizes}
        onChange={(v) => update("sizes", v)}
        help='Example: [{"name":"Box of 4","extra":0}]'
      />
      <JsonField
        label="Flavours"
        value={p.flavours}
        onChange={(v) => update("flavours", v)}
      />
      <JsonField
        label="Unavailable dates (YYYY-MM-DD)"
        value={p.unavailableDates}
        onChange={(v) => update("unavailableDates", v)}
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={p.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Visible on menu
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={p.reviewed}
          onChange={(e) => update("reviewed", e.target.checked)}
        />
        I have verified the price, portions, ingredients, allergens and image
        rights for live orders.
      </label>
      <button className="button" disabled={busy || uploading}>
        {uploading ? "Uploading…" : "Save product"}
        <Save size={16} />
      </button>
    </form>
  );
}
function Settings({ initial, busy, save }) {
  const [s, setS] = useState(initial),
    [error, setError] = useState("");
  const update = (k, v) => setS({ ...s, [k]: v });
  return (
    <form
      className="panel admin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (e.currentTarget.querySelector("[role=alert]")) {
          setError("Correct the JSON fields before saving.");
          return;
        }
        setError("");
        save(s);
      }}
    >
      <h2>How your kitchen works.</h2>
      <p className="small-muted">
        Changes apply to new orders. Existing order totals and agreed quotes are
        preserved. All price values in JSON use paise.
      </p>
      {error && <p className="error">{error}</p>}
      <label>
        Categories (one per line)
        <textarea
          value={s.categories.join("\n")}
          onChange={(e) =>
            update("categories", e.target.value.split("\n").filter(Boolean))
          }
        />
      </label>
      <label>
        WhatsApp number{" "}
        <small>
          Country code + number, no + or spaces. Leave blank to hide.
        </small>
        <input
          value={s.whatsapp}
          pattern="91[6-9][0-9]{9}|"
          onChange={(e) => update("whatsapp", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Minimum order (₹)
          <input
            type="number"
            min={0}
            required
            step="0.01"
            value={s.minimumOrder / 100}
            onChange={(e) =>
              update("minimumOrder", Math.round(Number(e.target.value) * 100))
            }
          />
        </label>
        <label>
          Preparation lead time (days)
          <input
            required
            type="number"
            min={1}
            max={90}
            value={s.leadDays}
            onChange={(e) => update("leadDays", Number(e.target.value))}
          />
        </label>
        <label>
          Daily capacity (orders)
          <input
            required
            type="number"
            min={1}
            max={1000}
            value={s.dailyCapacity}
            onChange={(e) => update("dailyCapacity", Number(e.target.value))}
          />
        </label>
        <label>
          Pickup address
          <input
            required
            value={s.pickupAddress}
            onChange={(e) => update("pickupAddress", e.target.value)}
          />
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={s.pickupEnabled}
          onChange={(e) => update("pickupEnabled", e.target.checked)}
        />
        Allow pickup
      </label>
      <JsonField
        label="Delivery areas"
        value={s.deliveryAreas}
        onChange={(v) => update("deliveryAreas", v)}
        help='Example: [{"name":"Town centre","pincodes":["622001"],"fee":5000}]'
      />
      <JsonField
        label="Blocked dates"
        value={s.blockedDates}
        onChange={(v) => update("blockedDates", v)}
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={s.businessReviewed}
          onChange={(e) => update("businessReviewed", e.target.checked)}
        />
        Business identity, delivery rules, contact, tax treatment, and all
        public claims have been reviewed.
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={s.policiesReviewed}
          onChange={(e) => update("policiesReviewed", e.target.checked)}
        />
        Approved legal policies have replaced the draft text in the website
        source.
      </label>
      <div className="notice">
        These switches do not change website copy. Replace draft policies and
        placeholders before enabling live payments. Razorpay mode and secrets
        are server environment variables.
      </div>
      <button className="button" disabled={busy}>
        Save kitchen settings <Save size={16} />
      </button>
    </form>
  );
}
function Enquiry({ enquiry: e, save, disabled }) {
  const [show, setShow] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget));
    await save({
      ...f,
      amount: Math.round(Number(f.amount) * 100),
      deliveryFee: Math.round(Number(f.deliveryFee) * 100),
      depositAmount: Math.round(Number(f.depositAmount) * 100),
      validDays: Number(f.validDays),
    });
  }
  return (
    <article className="admin-item">
      <h3>
        {e.name} · {e.occasion}
      </h3>
      <div className="admin-status">
        <span>{e.status}</span>
        <span>Requested: {e.date}</span>
      </div>
      <p>
        {e.phone} · {e.email}
      </p>
      <p>
        {e.servings} servings · {e.flavour} · budget {money(e.budget * 100)}
      </p>
      <p>{e.message}</p>
      {e.reference && (
        <a
          className="text-link"
          href={"/api/admin/references/" + e.id}
          target="_blank"
          rel="noreferrer"
        >
          View private reference image
        </a>
      )}
      {e.quote && (
        <div className="balance-note">
          Quoted {money(e.quote.amount + e.quote.deliveryFee)} · Deposit{" "}
          {money(e.quote.depositAmount)} · {e.quote.date}
        </div>
      )}
      {!e.orderId && (
        <>
          <button className="text-link" onClick={() => setShow(!show)}>
            {show
              ? "Close quote editor"
              : e.quote
                ? "Edit quote"
                : "Review & prepare a quote"}
          </button>
          {show && (
            <form onSubmit={submit}>
              <label>
                Agreed design & details
                <textarea
                  required
                  minLength={5}
                  name="description"
                  defaultValue={e.quote?.description || ""}
                />
              </label>
              <div className="form-grid">
                <label>
                  Cake price (₹)
                  <input
                    name="amount"
                    required
                    type="number"
                    min={1}
                    step="0.01"
                    defaultValue={e.quote ? e.quote.amount / 100 : ""}
                  />
                </label>
                <label>
                  Deposit or full amount due now (₹)
                  <input
                    name="depositAmount"
                    required
                    type="number"
                    min={1}
                    step="0.01"
                    defaultValue={e.quote ? e.quote.depositAmount / 100 : ""}
                  />
                </label>
                <label>
                  Delivery fee (₹)
                  <input
                    required
                    name="deliveryFee"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={e.quote ? e.quote.deliveryFee / 100 : 0}
                  />
                </label>
                <label>
                  Agreed fulfilment date
                  <input
                    required
                    name="date"
                    type="date"
                    defaultValue={e.quote?.date || e.date}
                  />
                </label>
                <label>
                  Method
                  <select
                    name="method"
                    defaultValue={e.quote?.method || "pickup"}
                  >
                    <option>pickup</option>
                    <option>delivery</option>
                  </select>
                </label>
                <label>
                  Quote valid for (days)
                  <input
                    name="validDays"
                    type="number"
                    min={1}
                    max={30}
                    required
                    defaultValue={7}
                  />
                </label>
              </div>
              <p className="small-muted">
                Share agreed details with the customer. Their existing private
                enquiry link displays this quote. Capacity is reserved only when
                they accept.
              </p>
              <button className="button" disabled={disabled}>
                Save reviewed quote <Save size={16} />
              </button>
            </form>
          )}
        </>
      )}
    </article>
  );
}
