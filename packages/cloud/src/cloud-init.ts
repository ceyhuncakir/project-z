/**
 * Builds the cloud-init payload handed to every provider.
 *
 * SSH keys are injected through cloud-init rather than each provider's
 * account-level key store: provider key stores are shared by every server
 * in the platform account, which would leak one customer's key onto another
 * customer's machine.
 */
export function buildUserData(
	sshPublicKeys: string[],
	userData?: string | null,
): string {
	// With disable_root: false cloud-init installs these keys for root as well
	// as the image's default user (ubuntu, debian, rocky...).
	const keys = sshPublicKeys
		.map((k) => `  - ${JSON.stringify(k.trim())}`)
		.join("\n");
	const base = [
		"#cloud-config",
		"disable_root: false",
		"ssh_pwauth: false",
		"ssh_authorized_keys:",
		keys,
		"",
	].join("\n");

	if (!userData?.trim()) return base;

	// Combine our part with the caller's (any cloud-init format) as MIME multipart.
	const boundary = `==HESSIANLABS-${crypto.randomUUID()}==`;
	const userType = detectUserDataType(userData);
	return [
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		"MIME-Version: 1.0",
		"",
		`--${boundary}`,
		'Content-Type: text/cloud-config; charset="utf-8"',
		"MIME-Version: 1.0",
		'Content-Disposition: attachment; filename="hessianlabs.cfg"',
		"",
		base,
		`--${boundary}`,
		`Content-Type: ${userType}; charset="utf-8"`,
		"MIME-Version: 1.0",
		'Content-Disposition: attachment; filename="user-data"',
		"",
		userData,
		`--${boundary}--`,
		"",
	].join("\n");
}

function detectUserDataType(userData: string): string {
	const first = userData.trimStart().split("\n", 1)[0] ?? "";
	if (first.startsWith("#cloud-config")) return "text/cloud-config";
	if (first.startsWith("#!")) return "text/x-shellscript";
	if (first.startsWith("#include")) return "text/x-include-url";
	if (first.startsWith("#cloud-boothook")) return "text/cloud-boothook";
	return "text/x-shellscript";
}
