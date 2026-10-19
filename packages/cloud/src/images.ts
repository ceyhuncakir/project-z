import {
	type Image,
	type ImageId,
	type LiveProviderId,
	ProviderError,
} from "./types";

export const IMAGES: Image[] = [
	{ id: "ubuntu-24.04", name: "Ubuntu 24.04 LTS", family: "ubuntu" },
	{ id: "ubuntu-22.04", name: "Ubuntu 22.04 LTS", family: "ubuntu" },
	{ id: "debian-12", name: "Debian 12", family: "debian" },
	{ id: "rocky-9", name: "Rocky Linux 9", family: "rocky" },
	{
		id: "ubuntu-22.04-cuda",
		name: "Ubuntu 22.04 + CUDA 12",
		family: "ubuntu",
		gpu: true,
	},
];

export const DEFAULT_IMAGE: ImageId = "ubuntu-24.04";
export const DEFAULT_GPU_IMAGE: ImageId = "ubuntu-22.04-cuda";

/**
 * Provider-native image identifiers. OVHcloud resolves images per region at
 * runtime by name, so it maps to the display name instead of an id.
 */
export const PROVIDER_IMAGES: Record<
	LiveProviderId,
	Partial<Record<ImageId, string>>
> = {
	hetzner: {
		"ubuntu-24.04": "ubuntu-24.04",
		"ubuntu-22.04": "ubuntu-22.04",
		"debian-12": "debian-12",
		"rocky-9": "rocky-9",
	},
	digitalocean: {
		"ubuntu-24.04": "ubuntu-24-04-x64",
		"ubuntu-22.04": "ubuntu-22-04-x64",
		"debian-12": "debian-12-x64",
		"rocky-9": "rockylinux-9-x64",
	},
	vultr: {
		// Vultr os_id values
		"ubuntu-24.04": "2284",
		"ubuntu-22.04": "1743",
		"debian-12": "2136",
		"rocky-9": "1869",
	},
	linode: {
		"ubuntu-24.04": "linode/ubuntu24.04",
		"ubuntu-22.04": "linode/ubuntu22.04",
		"debian-12": "linode/debian12",
		"rocky-9": "linode/rocky9",
	},
	ovhcloud: {
		"ubuntu-24.04": "Ubuntu 24.04",
		"ubuntu-22.04": "Ubuntu 22.04",
		"debian-12": "Debian 12",
		"rocky-9": "Rocky Linux 9",
	},
	scaleway: {
		"ubuntu-24.04": "ubuntu_noble",
		"ubuntu-22.04": "ubuntu_jammy",
		"debian-12": "debian_bookworm",
		"rocky-9": "rockylinux_9",
	},
};

/** Provider-native image id, or a non-retryable error if the provider lacks it. */
export function providerImage(
	provider: LiveProviderId,
	image: ImageId,
): string {
	const native = PROVIDER_IMAGES[provider][image];
	if (!native)
		throw new ProviderError(provider, `image ${image} is not available`);
	return native;
}
