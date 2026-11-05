# Review verification

Validated in the cloud workspace with Node 24, SQLite and Chromium. This is a **demo preview**, not a live store or a published deployment.

- `npm run build`: production bundle succeeds; dashboard is loaded separately from the storefront.
- `npm test`: 10 integration tests pass using temporary databases and a mocked Razorpay provider. They exercise trusted customization totals, delivery checks, date/stock/capacity restrictions, idempotency, private guest access, authentication/CSRF/origin checks, fulfilment/payment separation, signature rejection, captured-payment matching, authorized/pending state, webhook deduplication, quote approval, image rejection, live-mode guards, deposit + balance verification, persistence, interrupted provider requests, and expired reservations.
- `npm run test:browser`: 6 browser checks pass. They cover storefront guest checkout at 390px and 1440px, validation and totals, demo-unpaid confirmation, custom enquiry and quote acceptance, administrator boundaries, product/photo/settings editing, quote creation, fulfilment updates, and private-file protection. The administrator workflow uses an isolated production-build instance with temporary test credentials and data.
- Axe WCAG A/AA checks and horizontal-overflow checks pass for homepage, menu, product, custom enquiry and administrator sign-in at both tested widths. Automated checks do not replace a full manual assistive-technology audit.
- The saved review images are [desktop](preview-desktop.png), [mobile](preview-mobile.png), and [dashboard](preview-dashboard.png). Dashboard screenshots contain deliberately synthetic demo enquiry data, not a real customer.

Not verified against external services: real Razorpay sandbox/live payment, UPI/card payment instruments, provider webhook delivery, SMTP delivery or an Internet deployment. Those require the business's own credentials and hosting. Integration tests verify the local verification logic; they are not evidence of a real transaction.

Still for business review: live prices/portions/allergens, full original photography, delivery/pickup/capacity/lead-time rules, legal identity/tax treatment and approved policies. The supplied brownie reference was AI-edited for the labelled hero; other photos remain labelled illustration placeholders. No reviews, ratings, certifications or unverified storefront address have been added.
