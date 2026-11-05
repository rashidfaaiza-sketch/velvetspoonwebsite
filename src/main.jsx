import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ShoppingBag,
  Menu as MenuIcon,
  X,
  Heart,
  Leaf,
  MapPin,
  Instagram,
  MessageCircle,
  Plus,
  Minus,
  ChevronRight,
  CalendarDays,
  Check,
  LockKeyhole,
  Trash2,
  ChefHat,
  Package,
  Truck,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import {
  api,
  money,
  imageSrc,
  imageNote,
  productPhotos,
  launchPayment,
} from "./api";
import "./style.css";
const Admin = lazy(() => import("./Admin"));
const Context = createContext();
const useShop = () => useContext(Context);
const instagram = "https://www.instagram.com/_velvet_spoon/";
function App() {
  const [catalog, setCatalog] = useState(null),
    [error, setError] = useState(""),
    [cart, setCart] = useState(() => {
      try {
        const x = JSON.parse(localStorage.getItem("velvet-cart") || "[]");
        return Array.isArray(x) ? x : [];
      } catch {
        return [];
      }
    }),
    [toast, setToast] = useState("");
  useEffect(() => {
    api("/catalog")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(
    () => localStorage.setItem("velvet-cart", JSON.stringify(cart)),
    [cart],
  );
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const add = (item) => {
    setCart((prev) => {
      const same = prev.findIndex(
        (i) =>
          i.productId === item.productId &&
          i.size === item.size &&
          i.flavour === item.flavour &&
          i.message === item.message,
      );
      if (same < 0) return [...prev, item];
      return prev.map((i, n) =>
        n === same
          ? { ...i, quantity: Math.min(20, i.quantity + item.quantity) }
          : i,
      );
    });
    setToast("A little happiness added to your bag.");
  };
  const path = window.location.pathname,
    slug = path.split("/")[2];
  let content;
  if (path === "/admin")
    content = (
      <Suspense fallback={<Loading />}>
        <Admin />
      </Suspense>
    );
  else if (!catalog)
    content = error ? (
      <section className="section">
        <h1>One little moment…</h1>
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </section>
    ) : (
      <Loading />
    );
  else if (path === "/menu") content = <MenuPage />;
  else if (path.startsWith("/product/")) content = <ProductPage id={slug} />;
  else if (path === "/cart" || path === "/checkout") content = <Checkout />;
  else if (path.startsWith("/order/")) content = <OrderPage id={slug} />;
  else if (path === "/custom-cake") content = <CustomCake />;
  else if (path === "/quote") content = <QuotePage />;
  else if (path === "/about") content = <About />;
  else if (path === "/gallery") content = <Gallery />;
  else if (path === "/faqs") content = <FAQs />;
  else if (path === "/contact") content = <Contact />;
  else if (path.startsWith("/policies/")) content = <Policy type={slug} />;
  else if (path === "/") content = <Home />;
  else
    content = (
      <section className="section">
        <h1>A little lost?</h1>
        <a className="button" href="/">
          Back to the bakery
        </a>
      </section>
    );
  return (
    <Context.Provider value={{ catalog, cart, setCart, add, setToast }}>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <Header />
      <main id="main">{content}</main>
      <Footer />
      {catalog?.settings.whatsapp && (
        <a
          className="whatsapp"
          href={`https://wa.me/${catalog.settings.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with Velvet Spoon on WhatsApp"
        >
          <MessageCircle size={21} />
          <span>Let’s talk treats</span>
        </a>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <span className="monogram">v.</span>
      <p>Something sweet is on its way…</p>
    </div>
  );
}
function Header() {
  const { cart, catalog } = useShop(),
    [open, setOpen] = useState(false);
  return (
    <>
      <div className="announcement">
        Sweet moments in every spoon <span>✦</span> Homemade in Pudukkottai
      </div>
      <header className="header">
        <a className="brand" href="/" aria-label="Velvet Spoon home">
          <span>
            velvet spoon<span className="brand-dot">.</span>
          </span>
          <small>HOMEMADE · HEARTMADE</small>
        </a>
        <nav
          className={open ? "navigation open" : "navigation"}
          aria-label="Main navigation"
        >
          {[
            ["/menu", "Our menu"],
            ["/custom-cake", "Custom cakes"],
            ["/about", "Our story"],
            ["/gallery", "The sweet journal"],
          ].map(([url, label]) => (
            <a
              key={url}
              href={url}
              aria-current={location.pathname === url ? "page" : undefined}
            >
              {label}
            </a>
          ))}
          <a href="/contact" className="mobile-contact">
            Say hello
          </a>
        </nav>
        <div className="header-actions">
          <a className="header-contact" href="/contact">
            Say hello <ArrowUpRight size={16} />
          </a>
          <a
            href="/cart"
            className="bag"
            aria-label={`Shopping bag, ${cart.reduce((n, i) => n + i.quantity, 0)} items`}
          >
            <ShoppingBag size={21} />
            <span>{cart.reduce((n, i) => n + i.quantity, 0)}</span>
          </a>
          <button
            className="icon-button mobile-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <MenuIcon />}
          </button>
        </div>
      </header>
      {catalog && catalog.mode !== "live" && (
        <div className="preview-banner">
          {catalog.mode === "demo"
            ? "PREVIEW · Demo checkout. No real payments or confirmed orders."
            : "TEST MODE · Razorpay test payments only. No live charges."}
        </div>
      )}
    </>
  );
}
function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div>
          <a className="brand" href="/">
            <span>velvet spoon.</span>
            <small>SWEET MOMENTS IN EVERY SPOON</small>
          </a>
          <p>
            A little homemade happiness,
            <br />
            from Pudukkottai, with love.
          </p>
        </div>
        <div>
          <h3>Something sweet</h3>
          <a href="/menu">Explore the menu</a>
          <a href="/custom-cake">Create a celebration</a>
          <a href="/about">Meet the baker</a>
        </div>
        <div>
          <h3>Here to help</h3>
          <a href="/faqs">Your questions, answered</a>
          <a href="/contact">Get in touch</a>
          <a href={instagram} target="_blank" rel="noreferrer">
            Instagram <ArrowUpRight size={12} />
          </a>
        </div>
        <div>
          <h3>The little details</h3>
          {["delivery", "cancellation", "refund", "privacy", "terms"].map(
            (t) => (
              <a key={t} href={"/policies/" + t}>
                {t[0].toUpperCase() + t.slice(1)} policy
              </a>
            ),
          )}
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Velvet Spoon. Made with a little extra
          love.
        </span>
        <a href="/admin">
          Baker’s corner <LockKeyhole size={12} />
        </a>
      </div>
    </footer>
  );
}
function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}
function Home() {
  const { catalog } = useShop();
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <Eyebrow>
            <span className="tiny-line" /> A LITTLE LOVE. A LITTLE INDULGENCE.
          </Eyebrow>
          <h1>
            Homemade
            <br />
            happiness,
            <br />
            <em>baked to order.</em>
          </h1>
          <p>
            For the everyday cravings and the moments
            <br className="desktop-break" /> worth celebrating. A little
            sweetness, made just for you.
          </p>
          <div className="hero-actions">
            <a className="button" href="/menu">
              Order Now <ArrowUpRight size={18} />
            </a>
            <a className="text-link" href="/menu">
              Explore the Menu <ArrowRight size={17} />
            </a>
          </div>
          <div className="hero-note">
            <Heart size={17} strokeWidth={1.3} />
            <span>From our home kitchen, with love.</span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            className="hero-photo"
            src="/images/hero.png"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/brownie.svg";
            }}
            alt="Chocolate brownie with a generous caramel topping"
            fetchPriority="high"
          />
          <div className="hero-seal">
            <span>MADE TO ORDER</span>
            <Heart size={24} strokeWidth={1} />
            <span>MADE WITH LOVE</span>
          </div>
          <div className="photo-label">A spoonful of something special.</div>
          <span className="hero-image-note">
            AI-edited photo · reference supplied by Velvet Spoon
          </span>
        </div>
        <span className="hero-index">01 / THE SWEET LIFE</span>
      </section>
      <div className="promise-strip">
        <span>
          <ChefHat />
          Homemade, always
        </span>
        <i>✦</i>
        <span>
          <Heart />
          Made on pre-order
        </span>
        <i>✦</i>
        <span>
          <Sparkles />
          Custom flavours, your way
        </span>
        <i>✦</i>
        <span>
          <MapPin />
          Pudukkottai, Tamil Nadu
        </span>
      </div>
      <section className="section favourites">
        <div className="section-heading">
          <div>
            <Eyebrow>FROM OUR KITCHEN</Eyebrow>
            <h2>
              A little something
              <br />
              <em>to fall in love with.</em>
            </h2>
          </div>
          <div>
            <p>
              Rich, creamy, fudgy, dreamy.
              <br />
              Find your kind of happiness.
            </p>
            <a className="text-link" href="/menu">
              Discover the menu <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
        <div className="product-grid">
          {catalog.products.slice(0, 3).map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
        <p className="caption">
          Preview menu · Prices and portions are samples awaiting the baker’s
          review.
        </p>
      </section>
      <section className="custom-banner">
        <span className="sparkle">✧</span>
        <div>
          <Eyebrow>YOUR OCCASION, YOUR WAY</Eyebrow>
          <h2>
            Big moments deserve
            <br />
            <em>something personal.</em>
          </h2>
          <p>
            A birthday wish. A sweet thank-you. Just because.
            <br />
            Tell us what you’re dreaming of. We’ll take it from there.
          </p>
          <a className="button light" href="/custom-cake">
            Let’s create something <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="cake-sketch" aria-hidden="true">
          <div className="candle" />
          <div className="cake-top" />
          <div className="cake-bottom" />
          <div className="cake-plate" />
          <span>made for your moment</span>
        </div>
      </section>
      <section className="section story-preview">
        <div className="story-art">
          <img
            src="/images/milk.svg"
            alt="Dessert illustration placeholder"
            loading="lazy"
          />
          <span>
            from my kitchen
            <br />
            <em>to your happy place.</em>
          </span>
        </div>
        <div>
          <Eyebrow>THE HEART BEHIND THE SPOON</Eyebrow>
          <h2>
            Not just dessert.
            <br />
            <em>A little piece of home.</em>
          </h2>
          <p>
            Velvet Spoon began in a home kitchen in Pudukkottai, with a love for
            creating desserts that bring comfort and joy.
          </p>
          <p>
            From silky puddings to fudgy brownies, every creation is made on
            pre-order. Because the sweetest things feel personal.
          </p>
          <a className="text-link" href="/about">
            A note from our baker <ArrowUpRight size={17} />
          </a>
          <span className="signature">With love, Azmi</span>
        </div>
      </section>
      <section className="instagram-section">
        <Eyebrow>FRESH FROM THE SWEET SIDE</Eyebrow>
        <h2>
          A little more <em>Velvet Spoon.</em>
        </h2>
        <p>Peek into our kitchen on Instagram.</p>
        <a
          className="text-link"
          href={instagram}
          target="_blank"
          rel="noreferrer"
        >
          <Instagram size={17} /> @_velvet_spoon <ArrowUpRight size={15} />
        </a>
      </section>
    </>
  );
}
function ProductPhoto({ image, alt = "", loading }) {
  const photo = productPhotos[image];
  if (!photo) return <img src={imageSrc(image)} alt={alt} loading={loading} />;
  return (
    <svg
      className="product-photo"
      viewBox={photo.crop}
      preserveAspectRatio="xMidYMid slice"
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <image href={photo.src} width="1774" height="887" />
    </svg>
  );
}
function ProductCard({ product: p, index = 0 }) {
  return (
    <article className="product-card">
      <a className={`product-image image-${p.image}`} href={"/product/" + p.id}>
        <ProductPhoto
          image={p.image}
          alt={p.name + " — " + imageNote(p.image)}
          loading="lazy"
        />
        <span className="product-tag">{p.category}</span>
        <span className="round-arrow">
          <ArrowUpRight size={21} />
        </span>
      </a>
      <div className="product-title">
        <h3>
          <a href={"/product/" + p.id}>{p.name}</a>
        </h3>
        <span>{money(p.price)}</span>
      </div>
      <p>{p.description}</p>
      <span className="small-muted">
        {p.stock === 0
          ? "Currently sold out"
          : p.reviewed
            ? "Made to order"
            : "Sample price · details pending review"}
      </span>
    </article>
  );
}
function MenuPage() {
  const { catalog } = useShop(),
    [category, setCategory] = useState("All treats"),
    [query, setQuery] = useState("");
  const products = catalog.products.filter(
    (p) =>
      (category === "All treats" || p.category === category) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="section menu-page">
      <div className="page-intro">
        <Eyebrow>GOOD THINGS COME BY THE SPOONFUL</Eyebrow>
        <h1>
          Find your <em>sweet spot.</em>
        </h1>
        <p>
          Something for a celebration. Something just for you.
          <br />
          All made on pre-order, from our home kitchen.
        </p>
      </div>
      <div className="menu-tools">
        <div className="category-tabs" aria-label="Product categories">
          {["All treats", ...catalog.settings.categories].map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search-label">
          <span className="sr-only">Search treats</span>
          <input
            type="search"
            placeholder="Find a little treat…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="notice">
        <Leaf size={19} />
        <span>
          {catalog.settings.leadDays} days’ preparation time · Minimum order{" "}
          {money(catalog.settings.minimumOrder)} · Preview prices and portions
          need baker approval.
        </span>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <ChefHat size={42} />
          <h2>Still in the mixing bowl.</h2>
          <p>
            No verified products in this category yet. Tell us what you have in
            mind.
          </p>
          <a className="text-link" href="/custom-cake">
            Ask the baker <ArrowRight size={16} />
          </a>
        </div>
      )}
      <p className="caption">
        AI-generated product images are illustrative. Ingredients and allergens
        must be confirmed with the baker.
      </p>
    </section>
  );
}
function ProductPage({ id }) {
  const { catalog, add } = useShop(),
    p = catalog.products.find((p) => p.id === id),
    [size, setSize] = useState(p?.sizes[0]?.name || ""),
    [flavour, setFlavour] = useState(p?.flavours[0] || ""),
    [quantity, setQuantity] = useState(1),
    [message, setMessage] = useState(""),
    [date, setDate] = useState(""),
    [dates, setDates] = useState([]);
  useEffect(() => {
    api("/availability").then((x) => setDates(x.dates));
  }, []);
  if (!p)
    return (
      <section className="section">
        <h1>This treat isn’t on the menu.</h1>
        <a href="/menu">Back to menu</a>
      </section>
    );
  const price =
    p.price +
    (p.sizes.find((x) => x.name === size)?.extra || 0) +
    (message ? p.customizationPrice : 0);
  return (
    <section className="section">
      <a className="back-link" href="/menu">
        <ArrowLeft size={16} />
        Back to all treats
      </a>
      <div className="product-detail">
        <div className="detail-image">
          <ProductPhoto
            image={p.image}
            alt={p.name + " — " + imageNote(p.image)}
          />
          <span>{imageNote(p.image)}</span>
        </div>
        <div>
          <Eyebrow>{p.category} · MADE TO ORDER</Eyebrow>
          <h1>{p.name}</h1>
          <p className="lead">{p.description}</p>
          <p className="price">
            {money(price)} <small>{p.reviewed ? "INR" : "sample price"}</small>
          </p>
          <div className="notice">{p.portion}</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add({ productId: p.id, size, flavour, quantity, message });
            }}
          >
            <div className="form-grid">
              <label>
                Choose a portion
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  {p.sizes.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Your flavour
                <select
                  value={flavour}
                  onChange={(e) => setFlavour(e.target.value)}
                >
                  {p.flavours.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              A little message?{" "}
              <span className="small-muted">
                Optional · +{money(p.customizationPrice)}
              </span>
              <input
                value={message}
                maxLength={80}
                placeholder="Happy birthday, my favourite human"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <label>
              Check a preferred date
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="">See available dates</option>
                {dates
                  .filter((d) => !p.unavailableDates.includes(d))
                  .map((d) => (
                    <option key={d}>{d}</option>
                  ))}
              </select>
            </label>
            <p className="small-muted">
              Choose your final fulfilment date at checkout. Availability is
              checked again before payment.
            </p>
            <div className="add-row">
              <div className="quantity">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus size={15} />
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(Math.min(20, quantity + 1))}
                >
                  <Plus size={15} />
                </button>
              </div>
              <button className="button" disabled={p.stock === 0}>
                {p.stock === 0
                  ? "Sold out"
                  : `Add to bag · ${money(price * quantity)}`}
                <ShoppingBag size={18} />
              </button>
            </div>
          </form>
          <div className="detail-accordions">
            <details open>
              <summary>Ingredients & allergens</summary>
              <p>{p.ingredients}</p>
              <p>
                <strong>Allergens:</strong> {p.allergens}
              </p>
            </details>
            <details>
              <summary>Made for your day</summary>
              <p>
                Please allow {catalog.settings.leadDays} days. Pickup and
                delivery options are shown at checkout. Custom flavours are
                subject to the baker’s confirmation.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
function Checkout() {
  const { catalog, cart, setCart } = useShop(),
    [step, setStep] = useState(0),
    [form, setForm] = useState({
      method: "pickup",
      date: "",
      customer: {
        name: "",
        phone: "",
        email: "",
        address: "",
        pincode: "",
        instructions: "",
      },
    }),
    [dates, setDates] = useState([]),
    [review, setReview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    api("/availability")
      .then((x) => setDates(x.dates))
      .catch((e) => setError(e.message));
  }, []);
  const items = cart.map((i) => {
    const p = catalog.products.find((p) => p.id === i.productId);
    const unit = p
      ? p.price +
        (p.sizes.find((s) => s.name === i.size)?.extra || 0) +
        (i.message ? p.customizationPrice : 0)
      : 0;
    return { ...i, p, unit };
  });
  const subtotal = items.reduce((s, i) => s + i.unit * i.quantity, 0);
  const update = (k, v) => setForm({ ...form, [k]: v }),
    customer = (k, v) =>
      setForm({ ...form, customer: { ...form.customer, [k]: v } });
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api("/checkout/preview", {
        method: "POST",
        body: { ...form, items: cart },
      });
      setReview(r);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function place() {
    setBusy(true);
    setError("");
    try {
      let key = sessionStorage.getItem("checkout-idempotency");
      const fp = JSON.stringify({ ...form, items: cart });
      if (!key || sessionStorage.getItem("checkout-fingerprint") !== fp) {
        key = crypto.randomUUID();
        sessionStorage.setItem("checkout-idempotency", key);
        sessionStorage.setItem("checkout-fingerprint", fp);
      }
      const r = await api("/orders", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: { ...form, items: cart },
      });
      sessionStorage.removeItem("checkout-idempotency");
      sessionStorage.removeItem("checkout-fingerprint");
      setCart([]);
      location.assign(`/order/${r.order.id}#${r.token}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <section className="section checkout-page">
      <Eyebrow>YOUR LITTLE BOX OF HAPPINESS</Eyebrow>
      <h1>
        {step === 0
          ? "The sweetest bag."
          : step === 1
            ? "Made for your day."
            : "One last little look."}
      </h1>
      <div className="steps">
        {["Your bag", "Your details", "Review & pay"].map((s, i) => (
          <span key={s} className={step === i ? "current" : ""}>
            <b>{i + 1}</b>
            {s}
          </span>
        ))}
      </div>
      {!cart.length ? (
        <div className="empty">
          <ShoppingBag size={40} />
          <h2>A little room for something sweet.</h2>
          <a href="/menu" className="button">
            Explore the menu <ArrowUpRight size={18} />
          </a>
        </div>
      ) : (
        <div className="checkout-grid">
          <div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {step === 0 ? (
              <>
                <div className="cart-lines">
                  {items.map((i, n) => (
                    <article className="cart-line" key={n}>
                      <ProductPhoto image={i.p?.image} alt="" />
                      <div>
                        <h3>{i.p?.name || "Unavailable product"}</h3>
                        <p>
                          {i.size} · {i.flavour}
                        </p>
                        {i.message && <small>“{i.message}”</small>}
                        <div className="quantity">
                          <button
                            aria-label={"Decrease " + i.p?.name}
                            onClick={() =>
                              setCart(
                                cart.map((x, j) =>
                                  j === n
                                    ? {
                                        ...x,
                                        quantity: Math.max(1, x.quantity - 1),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Minus size={14} />
                          </button>
                          <span>{i.quantity}</span>
                          <button
                            aria-label={"Increase " + i.p?.name}
                            onClick={() =>
                              setCart(
                                cart.map((x, j) =>
                                  j === n
                                    ? {
                                        ...x,
                                        quantity: Math.min(20, x.quantity + 1),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <strong>{money(i.unit * i.quantity)}</strong>
                        <button
                          className="icon-button remove"
                          aria-label={"Remove " + i.p?.name}
                          onClick={() =>
                            setCart(cart.filter((_, j) => j !== n))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <a className="text-link" href="/menu">
                  <Plus size={16} />A little something more?
                </a>
              </>
            ) : step === 1 ? (
              <form id="checkout-form" onSubmit={submit}>
                <h2>Pickup or delivery?</h2>
                <div className="method-choices">
                  {catalog.settings.pickupEnabled && (
                    <button
                      type="button"
                      className={form.method === "pickup" ? "selected" : ""}
                      aria-pressed={form.method === "pickup"}
                      onClick={() => update("method", "pickup")}
                    >
                      <Package />
                      Pickup
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={form.method === "delivery"}
                    className={form.method === "delivery" ? "selected" : ""}
                    onClick={() => update("method", "delivery")}
                  >
                    <Truck />
                    Delivery
                  </button>
                </div>
                <label>
                  Preferred fulfilment date
                  <select
                    required
                    value={form.date}
                    onChange={(e) => update("date", e.target.value)}
                  >
                    <option value="">Choose an available date</option>
                    {dates.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <p className="small-muted">
                  Times and{" "}
                  {form.method === "pickup"
                    ? "pickup address"
                    : "delivery slot"}{" "}
                  will be agreed with the baker. {catalog.settings.leadDays}{" "}
                  days’ preparation time.
                </p>
                <h2>Your details</h2>
                <p>Guest checkout. No account needed.</p>
                <CustomerFields
                  value={form.customer}
                  onChange={customer}
                  delivery={form.method === "delivery"}
                />
                <label>
                  Delivery or pickup instructions{" "}
                  <span className="small-muted">Optional</span>
                  <textarea
                    maxLength={500}
                    value={form.customer.instructions}
                    onChange={(e) => customer("instructions", e.target.value)}
                    placeholder="A little note for the baker"
                  />
                </label>
                <label className="checkbox">
                  <input
                    required
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I’ve read the{" "}
                    <a href="/policies/privacy" target="_blank">
                      privacy
                    </a>
                    ,{" "}
                    <a href="/policies/terms" target="_blank">
                      terms
                    </a>{" "}
                    and{" "}
                    <a href="/policies/refund" target="_blank">
                      refund policy
                    </a>
                    . I understand these are draft policies and this preview
                    does not confirm a real bakery order.
                  </span>
                </label>
              </form>
            ) : (
              <div className="review">
                <h2>Everything look lovely?</h2>
                <h3>
                  {form.customer.name} · {form.customer.phone}
                </h3>
                <p>
                  {form.method === "pickup" ? "Pickup" : "Delivery"} ·{" "}
                  {form.date}
                </p>
                {form.method === "delivery" && (
                  <p>
                    {form.customer.address}
                    <br />
                    {form.customer.pincode}
                  </p>
                )}
                <p>{form.customer.instructions}</p>
                {review.items.map((i, n) => (
                  <div className="summary-line" key={n}>
                    <span>
                      {i.quantity} × {i.name}
                      <small>
                        {i.size} · {i.flavour}
                        {i.message && ` · “${i.message}”`}
                      </small>
                    </span>
                    <b>{money(i.lineTotal)}</b>
                  </div>
                ))}
                <div className="notice">
                  {catalog.mode === "demo"
                    ? "Demo mode: no card, UPI, or real payment is collected."
                    : catalog.mode === "test"
                      ? "Razorpay test mode: use test instruments only. No live charge."
                      : "Your payment is confirmed only after secure server verification."}
                </div>
                <button className="text-link" onClick={() => setStep(1)}>
                  Edit your details <ArrowLeft size={15} />
                </button>
              </div>
            )}
          </div>
          <aside className="order-summary">
            <Eyebrow>A SWEET LITTLE SUMMARY</Eyebrow>
            <h2>Made just for you.</h2>
            <div className="summary-line">
              <span>Subtotal</span>
              <b>{money(review?.subtotal ?? subtotal)}</b>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <b>{review ? money(review.deliveryFee) : "At next step"}</b>
            </div>
            <div className="summary-line">
              <span>Additional taxes / fees</span>
              <b>{review ? money(0) : "Shown before payment"}</b>
            </div>
            <div className="summary-total">
              <span>{review ? "Total" : "Subtotal"}</span>
              <b>{money(review?.total ?? subtotal)}</b>
            </div>
            {step === 0 ? (
              <button
                className="button full"
                disabled={
                  subtotal < catalog.settings.minimumOrder ||
                  items.some((i) => !i.p)
                }
                onClick={() => setStep(1)}
              >
                Continue to checkout <ArrowRight size={17} />
              </button>
            ) : step === 1 ? (
              <button
                className="button full"
                form="checkout-form"
                disabled={busy}
              >
                {busy ? "Checking availability…" : "Review your order"}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="button full"
                disabled={busy || !consent}
                onClick={place}
              >
                {busy
                  ? "Saving your order…"
                  : catalog.mode === "demo"
                    ? "Continue to demo checkout"
                    : "Continue to payment"}
                <LockKeyhole size={16} />
              </button>
            )}
            <p className="small-muted">
              Minimum order {money(catalog.settings.minimumOrder)}.{" "}
              {catalog.mode === "live"
                ? "Secure checkout by Razorpay."
                : "Sample prices and fulfilment settings for review."}
            </p>
            {step > 0 && (
              <button
                className="text-link"
                onClick={() => {
                  setReview(null);
                  setStep(step - 1);
                }}
              >
                Back <ArrowLeft size={14} />
              </button>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
function CustomerFields({ value, onChange, delivery = false }) {
  return (
    <>
      <div className="form-grid">
        <label>
          Your name
          <input
            required
            autoComplete="name"
            maxLength={100}
            minLength={2}
            value={value.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </label>
        <label>
          Mobile number <span className="small-muted">+91</span>
          <input
            required
            type="tel"
            autoComplete="tel-national"
            pattern="[6-9][0-9]{9}"
            maxLength={10}
            placeholder="10-digit mobile number"
            value={value.phone}
            onChange={(e) => onChange("phone", e.target.value)}
          />
        </label>
      </div>
      <label>
        Email{" "}
        <span className="small-muted">
          Optional · for confirmation if enabled
        </span>
        <input
          type="email"
          autoComplete="email"
          value={value.email || ""}
          onChange={(e) => onChange("email", e.target.value)}
        />
      </label>
      {delivery && (
        <>
          <label>
            Delivery address
            <textarea
              required
              autoComplete="street-address"
              minLength={10}
              maxLength={500}
              value={value.address}
              onChange={(e) => onChange("address", e.target.value)}
            />
          </label>
          <label>
            Pincode
            <input
              required
              autoComplete="postal-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={value.pincode}
              onChange={(e) => onChange("pincode", e.target.value)}
            />
          </label>
        </>
      )}
    </>
  );
}
function OrderPage({ id }) {
  const [order, setOrder] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    token = location.hash.slice(1);
  async function refresh() {
    try {
      const r = await api(`/orders/${id}`, {
        headers: { "x-order-token": token },
      });
      setOrder(r.order);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [id]);
  if (!order)
    return (
      <section className="section">
        <h1>Your order</h1>
        {error ? <p role="alert">{error}</p> : <Loading />}
      </section>
    );
  async function pay() {
    setBusy(true);
    try {
      await launchPayment(order, token, setOrder, setMessage);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section narrow confirmation">
      <span className="confirmation-icon">
        {order.paidAmount > 0 ? <Check /> : <ShoppingBag />}
      </span>
      <Eyebrow>
        {order.mode === "demo"
          ? "DEMO ORDER · UNPAID"
          : order.mode === "test"
            ? "TEST ORDER · NO LIVE CHARGE"
            : "YOUR VELVET SPOON ORDER"}
      </Eyebrow>
      <h1>
        {order.mode === "demo"
          ? "A little preview of happiness."
          : order.paymentStatus === "paid"
            ? "Payment verified."
            : "Your sweet moment awaits."}
      </h1>
      <p>
        {order.mode === "demo"
          ? "Your demo order is saved. No payment was taken. This is not a confirmed bakery order."
          : "Save this private link to check payment and fulfilment progress. The baker will confirm your order details."}
      </p>
      <p className="order-id">Order {order.id}</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="panel">
        <div className="status-grid">
          <div>
            <small>Payment</small>
            <strong>{order.paymentStatus.replaceAll("_", " ")}</strong>
          </div>
          <div>
            <small>Fulfilment</small>
            <strong>{order.stage}</strong>
          </div>
          <div>
            <small>Preferred date</small>
            <strong>{order.date}</strong>
          </div>
        </div>
        {order.needsReview && (
          <div className="notice">
            Your payment was verified after the reservation changed. Please
            contact the baker to confirm availability or arrange a refund.
          </div>
        )}
        {order.items.map((i, n) => (
          <div className="summary-line" key={n}>
            <span>
              {i.quantity} × {i.name}
              <small>
                {i.size} · {i.flavour}
              </small>
            </span>
            <b>{money(i.lineTotal)}</b>
          </div>
        ))}
        <div className="summary-line">
          <span>Delivery</span>
          <b>{money(order.deliveryFee)}</b>
        </div>
        <div className="summary-total">
          <span>Order total</span>
          <b>{money(order.total)}</b>
        </div>
        <div className="summary-line">
          <span>Verified amount {order.mode === "test" ? "(test)" : ""}</span>
          <b>{money(order.paidAmount)}</b>
        </div>
        <div className="summary-line">
          <span>Balance due</span>
          <b>{money(order.total - order.paidAmount)}</b>
        </div>
        {order.depositAmount > 0 && order.paidAmount === 0 && (
          <div className="notice">
            Deposit requested now: {money(order.depositAmount)}. Remaining
            balance: {money(order.total - order.depositAmount)}. Agreed
            fulfilment: {order.date}.
          </div>
        )}
        {order.stage !== "cancelled" && order.paidAmount < order.total && (
          <button className="button full" onClick={pay} disabled={busy}>
            {busy
              ? "Preparing…"
              : order.mode === "demo"
                ? "Try demo checkout (no payment)"
                : `Pay ${money(order.paidAmount === 0 && order.depositAmount ? order.depositAmount : order.total - order.paidAmount)} ${order.mode === "test" ? "· TEST" : ""}`}
            <LockKeyhole size={16} />
          </button>
        )}
        <button className="text-link" onClick={refresh}>
          Refresh order status
        </button>
      </div>
      <p className="small-muted">
        This link grants access to your order. Keep it private. Emails are sent
        only when an email service is configured.
      </p>
      <a href="/menu" className="text-link">
        Back to the sweet side <ArrowRight size={16} />
      </a>
    </section>
  );
}
function CustomCake() {
  const { catalog } = useShop(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(e.currentTarget),
        file = data.get("reference");
      if (file && !file.size) data.delete("reference");
      const r = await api("/enquiries", { method: "POST", body: data });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section custom-page">
      <div className="page-intro">
        <Eyebrow>LET’S MAKE IT PERSONAL</Eyebrow>
        <h1>
          Your moment.
          <br />
          <em>Your kind of sweet.</em>
        </h1>
        <p>
          Tell us what you’re dreaming of. The baker will review your ideas,
          <br />
          agree the details, and share a quote before any payment.
        </p>
      </div>
      {result ? (
        <div className="panel narrow">
          <Check />
          <h2>Your idea is in good hands.</h2>
          <p>{result.message}</p>
          <p>
            Save this private link to see your quote when the baker has reviewed
            your enquiry:
          </p>
          <a className="button" href={"/quote#" + result.token}>
            View your enquiry <ArrowRight size={18} />
          </a>
          <p className="small-muted">
            Keep the link private. No date is reserved until an agreed quote is
            accepted.
          </p>
        </div>
      ) : (
        <div className="enquiry-layout">
          <aside>
            <span className="monogram">v.</span>
            <h2>
              Every celebration
              <br />
              starts with <em>an idea.</em>
            </h2>
            <ol className="enquiry-steps">
              <li>Share your sweet little vision.</li>
              <li>We’ll confirm what’s possible and send a quote.</li>
              <li>Approve the details, then pay a deposit or in full.</li>
            </ol>
            <p>
              Custom cake availability, flavours and decoration are subject to
              the baker’s review.
            </p>
          </aside>
          <form className="panel" onSubmit={submit}>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="form-grid">
              <label>
                The occasion
                <input
                  name="occasion"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="A birthday, a wedding, a just-because…"
                />
              </label>
              <label>
                How many servings?
                <input
                  name="servings"
                  type="number"
                  required
                  min={1}
                  max={1000}
                  placeholder="e.g. 12"
                />
              </label>
              <label>
                Flavour you’re dreaming of
                <input
                  required
                  name="flavour"
                  minLength={2}
                  maxLength={100}
                  placeholder="Tell us your favourite"
                />
              </label>
              <label>
                Your budget (₹)
                <input
                  required
                  name="budget"
                  type="number"
                  min={100}
                  max={1000000}
                  placeholder="e.g. 1500"
                />
              </label>
            </div>
            <label>
              Required date
              <input
                required
                name="date"
                type="date"
                min={catalog.earliest}
                max={catalog.latest}
              />
            </label>
            <div className="form-grid">
              <label>
                Your name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Your mobile number (+91)
                <input
                  name="phone"
                  required
                  type="tel"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  autoComplete="tel-national"
                />
              </label>
            </div>
            <label>
              Email (optional)
              <input name="email" type="email" autoComplete="email" />
            </label>
            <label>
              A little more about your idea
              <textarea
                name="message"
                maxLength={2000}
                rows={4}
                placeholder="Colours, a message, special details, or dietary requirements for discussion…"
              />
            </label>
            <label className="upload-label">
              A little inspiration{" "}
              <span className="small-muted">
                Optional · JPEG, PNG, WebP · up to 5 MB
              </span>
              <input
                type="file"
                name="reference"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                I agree to the{" "}
                <a href="/policies/privacy" target="_blank">
                  draft privacy policy
                </a>{" "}
                and understand that this enquiry is subject to review, not an
                order confirmation.
              </span>
            </label>
            <button disabled={busy} className="button full">
              {busy ? "Sending your idea…" : "Send a little inspiration"}
              <ArrowUpRight size={18} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function QuotePage() {
  const [token] = useState(location.hash.slice(1)),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [customer, setCustomer] = useState({
      name: "",
      phone: "",
      email: "",
      address: "",
      pincode: "",
      instructions: "",
    }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/quote", { headers: { "x-enquiry-token": token } })
      .then((r) => {
        setResult(r);
        setCustomer((c) => ({
          ...c,
          name: r.enquiry.name,
          phone: r.enquiry.phone,
          email: r.enquiry.email || "",
        }));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function accept(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/quote/accept", {
        method: "POST",
        headers: { "x-enquiry-token": token },
        body: { customer, method: result.enquiry.quote.method },
      });
      location.assign(`/order/${r.order.id}#${r.token}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  const q = result?.enquiry.quote;
  return (
    <section className="section narrow">
      <Eyebrow>YOUR PRIVATE ENQUIRY</Eyebrow>
      <h1>
        A sweet idea,
        <br />
        <em>taking shape.</em>
      </h1>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="panel">
          <h2>{result.enquiry.occasion}</h2>
          <p>
            {result.enquiry.servings} servings · {result.enquiry.flavour}
          </p>
          <p>{result.enquiry.message}</p>
          {result.enquiry.orderId ? (
            <a
              className="button"
              href={`/order/${result.enquiry.orderId}#${result.orderToken}`}
            >
              View your order & balance <ArrowRight size={16} />
            </a>
          ) : q ? (
            <>
              <div className="notice">
                Baker-reviewed quote · valid until{" "}
                {new Date(q.expires).toLocaleDateString("en-IN")}
              </div>
              <p>{q.description}</p>
              <div className="summary-line">
                <span>Custom cake</span>
                <b>{money(q.amount)}</b>
              </div>
              <div className="summary-line">
                <span>Delivery</span>
                <b>{money(q.deliveryFee)}</b>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <b>{money(q.amount + q.deliveryFee)}</b>
              </div>
              <div className="summary-line">
                <span>Pay now</span>
                <b>{money(q.depositAmount)}</b>
              </div>
              <div className="summary-line">
                <span>Balance after deposit</span>
                <b>{money(q.amount + q.deliveryFee - q.depositAmount)}</b>
              </div>
              <p>
                Agreed fulfilment: <strong>{q.date}</strong> · {q.method}
              </p>
              <form onSubmit={accept}>
                <CustomerFields
                  value={customer}
                  onChange={(k, v) => setCustomer({ ...customer, [k]: v })}
                  delivery={q.method === "delivery"}
                />
                <label className="checkbox">
                  <input required type="checkbox" />
                  <span>
                    I accept this quote, fulfilment date, and{" "}
                    <a href="/policies/terms" target="_blank">
                      draft terms
                    </a>
                    .
                  </span>
                </label>
                <button
                  className="button full"
                  disabled={busy || q.expires < Date.now()}
                >
                  {q.expires < Date.now()
                    ? "Quote expired"
                    : busy
                      ? "Preparing…"
                      : "Accept quote & continue"}
                  <ArrowRight size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="notice">
              Awaiting the baker’s review. No payment is due and no fulfilment
              date is reserved yet. Revisit this private link for your quote.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
function About() {
  return (
    <section className="section about-page">
      <div className="page-intro">
        <Eyebrow>THE HEART BEHIND VELVET SPOON</Eyebrow>
        <h1>
          From my home kitchen
          <br />
          <em>to your dessert table.</em>
        </h1>
      </div>
      <div className="story-preview">
        <div className="story-art">
          <img src="/images/milk.svg" alt="Dessert illustration placeholder" />
          <span>
            comfort. joy.
            <br />
            <em>one spoonful at a time.</em>
          </span>
        </div>
        <div>
          <h2>
            A note from <em>our baker.</em>
          </h2>
          <p>
            “Hi! I’m the heart behind Velvet Spoon—a homemaker with a passion
            for creating desserts that bring comfort and joy.”
          </p>
          <p>
            Based in Pudukkottai, Velvet Spoon offers homemade desserts prepared
            on pre-order, with custom flavours available.
          </p>
          <p>
            “Thank you for supporting my small home-based business. Your love
            means everything!”
          </p>
          <span className="signature">With love, Azmi</span>
          <p className="small-muted">
            Words from Velvet Spoon’s published posts. Baker portrait and a
            fuller story are to be added with approval.
          </p>
          <a className="text-link" href="/menu">
            Find a little happiness <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
function Gallery() {
  const { catalog } = useShop();
  return (
    <section className="section">
      <div className="page-intro">
        <Eyebrow>THE SWEET JOURNAL</Eyebrow>
        <h1>
          Little moments.
          <br />
          <em>Lovely things.</em>
        </h1>
        <p>A taste of the Velvet Spoon kitchen.</p>
      </div>
      <div className="gallery-grid">
        {catalog.products.map((p) => (
          <figure key={p.id}>
            <a href={"/product/" + p.id}>
              <ProductPhoto
                image={p.image}
                alt={p.name + " — " + imageNote(p.image)}
                loading="lazy"
              />
            </a>
            <figcaption>
              {p.name}
              <small>{imageNote(p.image)}</small>
            </figcaption>
          </figure>
        ))}
      </div>
      <a className="button" href={instagram} target="_blank" rel="noreferrer">
        See the real kitchen on Instagram <Instagram size={18} />
      </a>
    </section>
  );
}
function FAQs() {
  const { catalog } = useShop();
  const questions = [
    [
      "How do I place an order?",
      "Choose a treat, customise it, and add it to your bag. Pick an available date, enter your details, and review the full price before checkout. This preview uses sample pricing and demo or test payments.",
    ],
    [
      "How far ahead should I order?",
      `The current sample setting is ${catalog.settings.leadDays} days. Available dates appear at checkout; the baker must confirm the final preparation schedule.`,
    ],
    [
      "Do you offer delivery?",
      "Delivery areas and fees are configurable. Enter your pincode at checkout to check the configured area. Current zones are demonstrations pending business review.",
    ],
    [
      "Can I customise a cake or flavour?",
      "Yes, custom flavours are mentioned in Velvet Spoon’s posts. Send a custom cake enquiry and the baker will review feasibility, price and date before asking for payment.",
    ],
    [
      "What about allergies?",
      "Verified ingredient lists and allergen information are still needed. Please contact the baker before ordering if you have any allergy. Do not assume a product is allergen-free.",
    ],
    [
      "Is my order confirmed after payment?",
      "Payment and fulfilment are tracked separately. A payment is marked paid only after the server verifies a matching captured payment. The baker will review and accept the order. Demo checkouts are never paid orders.",
    ],
    [
      "What are the refund and cancellation rules?",
      "These policies are draft text requiring business review. Read the policy pages and agree actual terms with the baker before live ordering.",
    ],
  ];
  return (
    <section className="section narrow">
      <div className="page-intro">
        <Eyebrow>A LITTLE CLARITY</Eyebrow>
        <h1>
          Good questions.
          <br />
          <em>Sweet answers.</em>
        </h1>
      </div>
      <div className="faq-list">
        {questions.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <p>
        Still wondering? <a href="/contact">Let’s have a little chat.</a>
      </p>
    </section>
  );
}
function Contact() {
  const { catalog } = useShop();
  return (
    <section className="section narrow">
      <div className="page-intro">
        <Eyebrow>WE’RE A MESSAGE AWAY</Eyebrow>
        <h1>
          Let’s talk
          <br />
          <em>something sweet.</em>
        </h1>
        <p>For cravings, celebrations, and all your little questions.</p>
      </div>
      <div className="contact-cards">
        <a href={instagram} target="_blank" rel="noreferrer">
          <Instagram />
          <h2>Say hello on Instagram</h2>
          <p>@_velvet_spoon</p>
          <ArrowUpRight />
        </a>
        {catalog.settings.whatsapp && (
          <a
            href={`https://wa.me/${catalog.settings.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle />
            <h2>Bulk & party orders</h2>
            <p>Chat on WhatsApp</p>
            <ArrowUpRight />
          </a>
        )}
      </div>
      <div className="notice">
        <MapPin size={24} />
        <span>
          Pudukkottai, Tamil Nadu, India.
          <br />
          Street address, opening hours, and pickup arrangements are awaiting
          confirmation. Please message before visiting.
        </span>
      </div>
      <p className="small-muted">
        Contact routes are taken from the existing brand reference. No email
        address or storefront address has been invented.
      </p>
    </section>
  );
}
const policyCopy = {
  delivery: [
    "Delivery & pickup",
    "Delivery areas, minimum orders, preparation lead times, fees and daily capacity must be approved by the business. Current checkout settings are samples.",
    "Before launch, specify serviceable pincodes, delivery timing, responsibility for delays, pickup location and contact process. Confirm the fulfilment date with the baker.",
  ],
  cancellation: [
    "Cancellations",
    "Cancellation deadlines and any charges have not yet been agreed. Contact the baker to discuss any request.",
    "Before launch, define the cancellation window, treatment of custom work already begun, deposits, changes to dates and the process for requesting cancellation. Cancelling fulfilment in the dashboard does not issue a payment refund.",
  ],
  refund: [
    "Refunds",
    "Refund eligibility, timelines and payment processing arrangements require business approval. No refund entitlement or turnaround is promised by this draft.",
    "Before launch, specify damaged or incorrect order reporting, evidence required, eligible cancellations, deposit treatment and expected bank processing times. Refunds must be processed separately through Razorpay and communicated to the customer.",
  ],
  privacy: [
    "Privacy",
    "This application stores checkout contact details, delivery addresses, order history, custom cake enquiries and uploaded references in a private database. Administrator sessions use an HTTP-only cookie. Your cart is saved locally in your browser.",
    "Payment details are entered in Razorpay hosted checkout; this application does not store card or UPI credentials. Customer emails are sent through the configured email provider only. Before launch, the business must provide its legal identity, privacy contact, retention period, deletion request process, lawful processing basis, hosting details and applicable Indian data protection disclosures.",
  ],
  terms: [
    "Terms of service",
    "Business legal name, applicable registration details, prices, portions, tax treatment, service availability and dispute contact must be verified before accepting live orders.",
    "Products and dates are subject to availability. Custom cake enquiries require a reviewed quote before payment. Demo orders and test payments are not real transactions. Before launch, approve order acceptance rules, custom design limitations, customer obligations, food safety and storage instructions, liability terms and dispute handling under applicable Indian law.",
  ],
};
function Policy({ type }) {
  const copy = policyCopy[type];
  if (!copy)
    return (
      <section className="section">
        <h1>Policy not found.</h1>
      </section>
    );
  return (
    <section className="section narrow policy">
      <Eyebrow>THE LITTLE DETAILS</Eyebrow>
      <h1>{copy[0]}</h1>
      <div className="draft-badge">
        DRAFT · REQUIRES BUSINESS & LEGAL REVIEW
      </div>
      <p className="lead">
        This page is a working draft, not an approved business policy. Resolve
        the details below before live ordering.
      </p>
      {copy.slice(1).map((p) => (
        <p key={p}>{p}</p>
      ))}
      <a href="/contact" className="text-link">
        Ask the baker <ArrowUpRight size={16} />
      </a>
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
