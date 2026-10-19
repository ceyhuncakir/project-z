import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * SSH helpers. When an agent asks for a server without supplying a key we
 * mint an ed25519 keypair, install the public half via cloud-init and hand
 * the private half back exactly once. We never store it.
 */

function sshString(buf: Buffer | string): Buffer {
	const data = typeof buf === "string" ? Buffer.from(buf) : buf;
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	return Buffer.concat([len, data]);
}

function uint32(n: number): Buffer {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(n);
	return b;
}

export interface GeneratedKeyPair {
	publicKey: string;
	privateKey: string;
	fingerprint: string;
}

export function generateEd25519KeyPair(
	comment = "switchyard",
): GeneratedKeyPair {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const pubJwk = publicKey.export({ format: "jwk" });
	const privJwk = privateKey.export({ format: "jwk" });
	const pub = Buffer.from(pubJwk.x as string, "base64url");
	const seed = Buffer.from(privJwk.d as string, "base64url");

	const pubWire = Buffer.concat([sshString("ssh-ed25519"), sshString(pub)]);
	const publicLine = `ssh-ed25519 ${pubWire.toString("base64")} ${comment}`;

	// openssh-key-v1, unencrypted
	const check = randomBytes(4);
	let privBlock = Buffer.concat([
		check,
		check,
		sshString("ssh-ed25519"),
		sshString(pub),
		sshString(Buffer.concat([seed, pub])),
		sshString(comment),
	]);
	const pad = (8 - (privBlock.length % 8)) % 8;
	privBlock = Buffer.concat([
		privBlock,
		Buffer.from(Array.from({ length: pad }, (_, i) => i + 1)),
	]);

	const body = Buffer.concat([
		Buffer.from("openssh-key-v1\0"),
		sshString("none"),
		sshString("none"),
		sshString(""),
		uint32(1),
		sshString(pubWire),
		sshString(privBlock),
	]);
	const b64 = body.toString("base64").replace(/(.{70})/g, "$1\n");
	const privateLine = `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64.trimEnd()}\n-----END OPENSSH PRIVATE KEY-----\n`;

	return {
		publicKey: publicLine,
		privateKey: privateLine,
		fingerprint: fingerprintOf(publicLine),
	};
}

const KEY_TYPES = new Set([
	"ssh-ed25519",
	"ssh-rsa",
	"ecdsa-sha2-nistp256",
	"ecdsa-sha2-nistp384",
	"ecdsa-sha2-nistp521",
	"sk-ssh-ed25519@openssh.com",
	"sk-ecdsa-sha2-nistp256@openssh.com",
]);

/** Validates an OpenSSH public key line and returns its SHA256 fingerprint. */
export function parsePublicKey(
	line: string,
): { type: string; fingerprint: string } | null {
	const parts = line.trim().split(/\s+/);
	const [type, data] = parts;
	if (!type || !data || !KEY_TYPES.has(type)) return null;
	let blob: Buffer;
	try {
		blob = Buffer.from(data, "base64");
	} catch {
		return null;
	}
	if (blob.length < 20) return null;
	const nameLen = blob.readUInt32BE(0);
	if (blob.subarray(4, 4 + nameLen).toString() !== type) return null;
	return { type, fingerprint: fingerprintOf(line) };
}

export function fingerprintOf(line: string): string {
	const data = line.trim().split(/\s+/)[1] ?? "";
	const digest = createHash("sha256")
		.update(Buffer.from(data, "base64"))
		.digest("base64");
	return `SHA256:${digest.replace(/=+$/, "")}`;
}
