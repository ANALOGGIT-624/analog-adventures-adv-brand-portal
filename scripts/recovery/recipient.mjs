import { Buffer } from "node:buffer";
import { createPublicKey, publicEncrypt, privateDecrypt, constants, createHash } from "node:crypto";

export function parseRecipient(encoded) {
  const pem = Buffer.from(encoded, "base64").toString("utf8");
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----")) throw new Error("Public recipient key required");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 3072)
    throw new Error("RSA recipient must be at least 3072 bits");
  return key;
}
function fingerprint(key) {
  return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}
export function wrapKey(key, recipient) {
  if (key.length !== 32) throw new Error("Invalid archive key");
  return { format: "analog-recipient-v1", algorithm: "RSA-OAEP-SHA256", recipient: fingerprint(recipient),
    wrappedKey: publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64") };
}
export function unwrapKey(envelope, privateKey) {
  if (envelope.format !== "analog-recipient-v1" || envelope.algorithm !== "RSA-OAEP-SHA256" || envelope.recipient !== fingerprint(createPublicKey(privateKey)))
    throw new Error("Wrong recovery recipient or envelope format");
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(envelope.wrappedKey, "base64"));
  if (key.length !== 32) throw new Error("Invalid recovered archive key");
  return key;
}
