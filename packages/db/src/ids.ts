import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Prefixed, url-safe random ids: `srv_k3j9x0q2m1v8z7c4`. */
export function newId(prefix: string, length = 18): string {
	const bytes = randomBytes(length);
	let out = "";
	for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
	return `${prefix}_${out}`;
}
