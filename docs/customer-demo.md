# Public customer demo

`render.yaml` prepares a free Render demo using the full storefront and backend.
It forces demo payments; no real transaction is collected. Administrator access
remains disabled unless its password hash is explicitly configured.

The website code must first be committed and pushed to a GitHub repository the
hosting account can read. Publishing the cloud environment does not push Git
changes or deploy a website.

1. Sign in at https://dashboard.render.com/ and connect the GitHub repository.
2. Choose **New → Blueprint**, select the repository and branch containing the
   website and `render.yaml`, and review the free demo service configuration.
3. Create the service and wait for the build and health check to succeed.
4. Copy the actual HTTPS URL shown by Render. Test the menu, customization,
   checkout review and demo-unpaid confirmation at that URL before sharing it.

`APP_ORIGIN` is set from Render's own external URL at startup, so the browser's
checkout requests match the server's allowed origin. No Razorpay credentials
are needed. Never share credentials in chat.

Free services may sleep, and their filesystem is ephemeral. Demo orders,
enquiries and uploads can reset on restart or redeployment. Ask reviewers to use
synthetic customer details. Do not enable live payments or accept real bakery
orders on this configuration. See `deployment.md` for persistent production
hosting and payment activation.

No Render service or public URL has been created merely by adding these files.
