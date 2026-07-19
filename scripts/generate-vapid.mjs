import { webcrypto } from "node:crypto";

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
const privateKey = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
const decode = (value) => Buffer.from(value, "base64url");

console.log("VAPID_SUBJECT=mailto:admin@example.com");
console.log(`VAPID_PUBLIC_KEY=${base64url(Buffer.concat([Buffer.from([4]), decode(publicKey.x), decode(publicKey.y)]))}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(decode(privateKey.d))}`);
console.log("\nStore these only in deployment secrets or .env.local. Do not commit them.");
