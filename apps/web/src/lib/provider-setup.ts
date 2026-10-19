/**
 * What each provider needs to connect a user's own account, and where to
 * create a token that can only do what Switchyard needs.
 */

export interface CredentialField {
	key: string;
	label: string;
	placeholder?: string;
	/** Rendered as a password input. */
	secret?: boolean;
	options?: { value: string; label: string }[];
}

export interface ProviderSetup {
	fields: CredentialField[];
	/** Where the user creates the credentials. */
	url: string;
	steps: string[];
}

export const PROVIDER_SETUP: Record<string, ProviderSetup> = {
	hetzner: {
		url: "https://console.hetzner.cloud/projects",
		fields: [{ key: "token", label: "API token", secret: true }],
		steps: [
			"Create a project just for Switchyard, so it only ever sees its own servers.",
			"In that project open Security → API tokens and generate a Read & Write token.",
		],
	},
	digitalocean: {
		url: "https://cloud.digitalocean.com/account/api/tokens",
		fields: [{ key: "token", label: "Personal access token", secret: true }],
		steps: [
			"Generate a new token under API → Tokens.",
			"Use custom scopes if you like: Droplets (create, read, update, delete) and account:read are enough.",
		],
	},
	vultr: {
		url: "https://my.vultr.com/settings/#settingsapi",
		fields: [{ key: "apiKey", label: "API key", secret: true }],
		steps: [
			"Enable the API under Account → API and copy the key.",
			"Leave access control open to all IPv4/IPv6 addresses: Switchyard's servers don't have fixed IPs.",
		],
	},
	linode: {
		url: "https://cloud.linode.com/profile/tokens",
		fields: [{ key: "token", label: "Personal access token", secret: true }],
		steps: [
			"Create a personal access token.",
			"Give it Linodes: Read/Write. Everything else can stay at No Access.",
		],
	},
	scaleway: {
		url: "https://console.scaleway.com/iam/api-keys",
		fields: [
			{ key: "secretKey", label: "Secret key", secret: true },
			{
				key: "projectId",
				label: "Project ID",
				placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		],
		steps: [
			"Create an IAM application with a policy scoped to one project: InstancesFullAccess and BlockStorageFullAccess.",
			"Generate an API key for that application and copy its secret key and the project ID.",
		],
	},
	ovhcloud: {
		url: "https://eu.api.ovh.com/createToken/",
		fields: [
			{
				key: "endpoint",
				label: "API endpoint",
				options: [
					{ value: "ovh-eu", label: "OVHcloud Europe (ovh-eu)" },
					{ value: "ovh-ca", label: "OVHcloud Canada (ovh-ca)" },
					{ value: "ovh-us", label: "OVHcloud US (ovh-us)" },
				],
			},
			{ key: "applicationKey", label: "Application key" },
			{ key: "applicationSecret", label: "Application secret", secret: true },
			{ key: "consumerKey", label: "Consumer key", secret: true },
			{ key: "projectId", label: "Public Cloud project ID" },
		],
		steps: [
			"Create a token on your region's createToken page (EU shown; use ca.api.ovh.com or api.us.ovhcloud.com for the others).",
			"Grant GET on /cloud/project/<id> and GET, POST and DELETE on /cloud/project/<id>/*, for your Public Cloud project.",
		],
	},
};

/** Preview providers can only be "connected" in sandbox mode; any value works there. */
export const SANDBOX_SETUP: ProviderSetup = {
	url: "",
	fields: [{ key: "token", label: "Token (sandbox: anything)", secret: true }],
	steps: ["Sandbox mode: nothing is sent to the provider."],
};
