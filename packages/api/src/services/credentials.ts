import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Users' cloud credentials are sealed with AES-256-GCM before they reach the
 * database. The row's owner and provider are bound as associated data, so a
 * sealed value copied onto another row fails to open.
 */

const VERSION = "v1";

/** CREDENTIALS_KEY is 32 random bytes, base64-encoded: `openssl rand -base64 32`. */
export function parseCredentialsKey(value: string): Buffer {
	const key = Buffer.from(value, "base64");
	if (key.length !== 32) {
		throw new Error(
			"CREDENTIALS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
		);
	}
	return key;
}

export function sealCredentials(
	key: Buffer,
	plaintext: string,
	context: string,
): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from(context));
	const data = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return [VERSION, iv, cipher.getAuthTag(), data]
		.map((part) =>
			typeof part === "string" ? part : part.toString("base64url"),
		)
		.join(".");
}

export function openCredentials(
	key: Buffer,
	sealed: string,
	context: string,
): string {
	const [version, iv, tag, data] = sealed.split(".");
	if (version !== VERSION || !iv || !tag || !data) {
		throw new Error("Unsupported credentials format");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(iv, "base64url"),
	);
	decipher.setAAD(Buffer.from(context));
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(data, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
