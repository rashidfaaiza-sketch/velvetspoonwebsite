# Velvet Spoon

A responsive bakery storefront, guest checkout, custom cake enquiries, and a protected baker dashboard. React + Vite provide a lightweight client; Express and Node 24's built-in SQLite provide the API and persistent database without an external database service. All amounts are integer paise; fulfilment dates use Asia/Kolkata.

**This is a review preview.** Default checkout is demo mode and never marks an order as paid. Product prices, portions, ingredients, delivery settings and policies need business approval before live orders. Original brand material is preserved in [docs/brand-reference.md](docs/brand-reference.md), [content.json](content.json), [posts.csv](posts.csv), and [docs/reference-catalogue.html](docs/reference-catalogue.html).

## Local development

```sh
npm ci
cp .env.example .env
node scripts/configure-admin.js
npm run dev
```

Use Node **24+**. Open the address matching `APP_ORIGIN` (default `http://127.0.0.1:3000`). The server binds to localhost. The password command securely prompts, stores only a scrypt hash in ignored `.env`, generates a session secret if blank, and preserves other settings. Username defaults to `baker`. Do not set a shared/default production password. Restart after environment changes. For cloud work use the existing isolated checkout; no worktree is needed.

No credentials are required for demo storefront and checkout. Without an administrator password hash, `/admin` is disabled. SQLite tables and sample products/settings are initialized automatically on first startup. Database, uploaded images, private enquiry references and an application key live in ignored `DATA_DIR`. Preserve this directory between restarts and deployments. Do not serve it as static content.

```sh
npm run build
npm test
# With npm run dev running in a separate terminal:
npm run test:browser
```

Browser tests use `/usr/bin/chromium`; set `CHROMIUM_PATH` to your installed Chromium executable. Integration tests use temporary databases and a mocked payment provider, not Razorpay. Browser tests exercise the running **demo** storefront and add clearly marked demo records. The test suite does not prove a real Razorpay transaction. Browser screenshots are in `docs/preview-desktop.png` and `docs/preview-mobile.png`.

## What is implemented

- Homepage, editable menu categories, product detail/customization, persistent browser cart, guest checkout, pickup/delivery, review, payment and private order status.
- Server validates products, sizes/flavours, quantity, message fee, minimum spend, pincode, address, Indian mobile number, lead time, blocked dates, stock and daily order capacity. Browsers never supply trusted totals. Dates are offered for the next 90 days.
- Atomic SQLite reservations (20 minutes) guard capacity and stock; completed/paid orders consume the configured product stock cap. Set stock `0` to sell out; `null` means unlimited. Stock is a cumulative sale cap, not an automatically replenishing per-day count. Increase the cap for a restock. Expired unpaid reservations release automatically when availability is computed. Late captured payments are flagged for baker review.
- Razorpay hosted checkout, server-created payment orders, HMAC callback + raw-body webhook verification, captured-amount/currency/order matching, idempotent submissions and unique payment/event handling. Payment remains pending until captured and verified. Closing the modal never marks paid or treats a potentially pending payment as safely cancelled.
- Custom enquiries with private image uploads; administrator-reviewed quotes, configurable deposit/full amount, fulfilment date and delivery fee; private customer quote acceptance and subsequent balance payment.
- Scrypt administrator authentication, rate limits, HTTP-only SameSite cookies, CSRF tokens, origin checks, security headers, private order tokens and private reference images. No default administrator credentials. Session lasts 8 hours. To revoke sessions immediately after a password change, stop the server and delete rows from `sessions` using an authenticated maintenance process, then restart.
- Dashboard manages products, photos, prices, stock, dates, categories, delivery zones/fees, minimum order, lead time, capacity, orders, fulfilment stages, enquiries and quotes. Payment status cannot be edited by the browser/dashboard. Cancellation never automatically refunds.
- Optional SMTP confirmation after verified payment, with persistent send status and dashboard retry. Email has at-least-once delivery semantics; a crash after SMTP accepts a message but before the status is committed can duplicate an email. Order/payment accounting is independently idempotent.

## Payments: demo → Razorpay test → live

1. Keep `PAYMENT_MODE=demo` for review. The button says **Try demo checkout (no payment)**. Demo orders remain `demo_unpaid` with verified amount ₹0. They are not bakery order confirmations. Do not use real customer information in a public demo.
2. Create/activate a Razorpay account and enable **Test Mode** in its dashboard. Generate test API keys. Set `PAYMENT_MODE=test`, `RAZORPAY_KEY_ID=rzp_test_…`, and the associated `RAZORPAY_KEY_SECRET` securely on the server. Never prefix secrets with `VITE_` or expose them to the browser.
3. Configure a Razorpay webhook pointing to `https://YOUR-DOMAIN/api/webhooks/razorpay`; set a unique `RAZORPAY_WEBHOOK_SECRET` on both sides. Subscribe to `payment.captured`, `order.paid`, `payment.failed`, and `payment.authorized`. Enable automatic payment capture in Razorpay. Uncaptured authorized payments remain pending here.
4. Use an HTTPS staging domain with exact `APP_ORIGIN`. Test UPI/cards and other account-enabled methods using Razorpay's current documented test instruments. Verify a captured test payment, duplicate webhook, failed payment, modal dismissal, pending capture, full quoted payment, deposit then balance, and reservation expiry. Check the order API and dashboard, not just the hosted success screen. Sandbox tests require your credentials and were not executed against Razorpay during this build.
5. An interrupted provider order-creation request is marked `creation_unknown`, and retries are blocked to avoid creating multiple payable orders. Reconcile its receipt (attempt UUID) in Razorpay before a controlled database repair. Do not blindly create another order or delete payment history. A provider callback failure can be recovered by an authentic webhook.
6. Before live mode, verify all business details listed below. Replace the draft policy copy in `src/main.jsx`, update/approve every offered product, and mark business and policies reviewed in dashboard settings. These flags alone do not replace draft text. Confirm tax-inclusive pricing/accounting with the business; the current additional-tax line is ₹0 and no GST invoice is fabricated.
7. Complete Razorpay business KYC, website verification and account activation. Configure enabled payment methods. Generate **live** API keys and a separate live webhook secret. Set `PAYMENT_MODE=live` and matching `rzp_live_…` server keys. Use a fresh production database reviewed by the baker; do not mix demo/test records with live fulfilment. Live mode requires HTTPS and fails closed without matching credentials/review flags. Take a controlled authorized live payment and verify capture + webhook + dashboard + email before opening orders publicly.
8. Refunds are initiated separately in the Razorpay dashboard after business review. Fulfilment cancellation only changes the order stage. This implementation does not automate refunds or reconcile `refund.*` events. Record and communicate refunds through the business's approved operational process.

Official provider references: [Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/), [webhooks](https://razorpay.com/docs/webhooks/), [test payments](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).

## Custom cake workflow

Customer submits `/custom-cake` with an optional JPEG/PNG/WebP (up to 5 MB). A random private link at `/quote#TOKEN` is returned; save it. The dashboard lets the baker review the reference and create a quote with design/ingredients/allergens agreed in its description, price, fee, deposit/full payment, method and date. The customer revisits that link, accepts the quote and provides delivery/contact details. Quotes do not reserve capacity until acceptance. Accepted quotes are immutable. Deposit and balance each use distinct server-side payment attempts. Customer `/order/ID#TOKEN` shows verified paid amount, balance and fulfilment stage. Quote notification is manual via the business's normal contact channel; this app does not send WhatsApp messages. Optional emails confirm verified payments, not unreviewed enquiries.

## Business details still required

- Current prices and portions. A supplied reference menu shows pudding ₹50, toppings ₹10 and minimum two pieces, but current validity and applicable products are not confirmed; sample checkout prices are explicitly labelled.
- Full verified ingredient/allergen lists, portion/serving descriptions, actual available cakes/cupcakes/cookies/seasonal products, customization constraints and storage instructions. Empty categories do not contain invented products.
- Legal business identity, applicable registration/tax details, rights to all media, approved story, pickup address/hours, serviceable pincodes, actual delivery fees/minimum spend, lead time and capacity.
- Cancellation/refund/deposit terms, approved delivery/terms/privacy policies, privacy contact and data retention/deletion process. Current legal pages are prominently marked drafts.
- Razorpay test/live keys and webhook secrets, unique administrator credentials, production session secret, domain/hosting, and optional SMTP credentials/from address.

Verified source details: Velvet Spoon, Pudukkottai; homemade/pre-order desserts, custom flavours, Instagram `@_velvet_spoon`, posted bulk/party WhatsApp `9443249494` (stored with India country code and editable). No reviews, ratings, certifications, storefront address or email have been invented. Some historical menu images contain claims; these are not copied as verified certifications.

## Images

Original catalogue image files were absent from the checkout. The supplied brownie photo was used as the reference for an **AI-edited, reframed hero** (`public/images/hero.png`), labelled on the site. Tres Leches, Biscoff Bliss, coconut pudding and rose milk pudding now use customer-approved AI-generated image concepts. Their original review sheets are retained as PNG assets and cropped with inline SVG viewports, so no review labels appear in the cards. Cards, product details, cart thumbnails and gallery share the same image mapping. These are illustrative concepts, not verified product photographs. Remaining products use explicitly labelled SVG placeholder illustrations. Chat attachments were visible as references but were not exposed as raw files in this workspace; they have not been silently recreated as original photographs. Import original photos through the dashboard to replace placeholders. For product photos, the dashboard accepts JPEG/PNG/WebP and stores them under public `/media`; customer enquiry references are stored privately and require administrator access. Review image rights, accuracy and accessibility text before launch.

## Deployment

See [docs/deployment.md](docs/deployment.md). The customer demo is hosted at https://velvet-spoon-demo.onrender.com in demo payment mode. Render rebuilds from the repository; live ordering requires the production setup and business review described above.
