import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import crypto from "node:crypto";
import { passwordHash } from "../server/domain.js";
if (!process.stdin.isTTY) {
  console.error(
    "Run this command in an interactive terminal to set your administrator password.",
  );
  process.exit(1);
}
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function ask(prompt) {
  process.stdout.write(prompt);
  muted = true;
  const value = await new Promise((resolve) => rl.question("", resolve));
  muted = false;
  process.stdout.write("\n");
  return value;
}
const password = await ask(
  "New administrator password (at least 14 characters): ",
);
const confirmation = await ask("Confirm password: ");
rl.close();
if (
  password.length < 14 ||
  password.length > 256 ||
  password !== confirmation
) {
  console.error(
    "Passwords must match and contain 14–256 characters. No file was changed.",
  );
  process.exit(1);
}
let contents = existsSync(".env") ? readFileSync(".env", "utf8") : "";
function set(name, value) {
  const line = name + "=" + JSON.stringify(value);
  const pattern = new RegExp("^" + name + "=.*$", "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, () => line)
    : contents.trimEnd() + "\n" + line + "\n";
}
set("ADMIN_PASSWORD_HASH", passwordHash(password));
if (
  !/^SESSION_SECRET=.+$/m.test(contents) ||
  /^SESSION_SECRET=["']{2}$/m.test(contents)
)
  set("SESSION_SECRET", crypto.randomBytes(48).toString("hex"));
writeFileSync(".env", contents.trimStart(), { mode: 0o600 });
chmodSync(".env", 0o600);
console.log(
  "Administrator password hash saved to .env. Username: ADMIN_USERNAME, or baker by default. Restart the server. No plaintext password was saved.",
);
