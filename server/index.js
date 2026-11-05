import "dotenv/config";
import express from "express";
import { createApp } from "./app.js";
import path from "node:path";
const { app } = createApp();
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.resolve("dist"), { index: false }));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/data/**",
          "**/*.sqlite*",
          "**/*.key",
          "**/references/**",
          path.resolve(process.env.DATA_DIR || "data") + "/**",
        ],
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Velvet Spoon ready on port ${port} (${process.env.PAYMENT_MODE || "demo"})`,
  ),
);
