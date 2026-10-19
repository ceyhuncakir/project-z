import type { server } from "@switchyard/db/schema/app";

type ServerStatus = (typeof server.$inferSelect)["status"];

/** Servers that exist at the provider and accrue charges. */
export const ACTIVE: ServerStatus[] = [
	"provisioning",
	"running",
	"stopped",
	"suspended",
	"deleting",
];

/** Ended servers: never charged again. */
export const CLOSED: ServerStatus[] = ["deleted", "error", "detached"];

/** Statuses the provider's view of a server may overwrite. */
export const SYNCABLE: ServerStatus[] = [
	"provisioning",
	"running",
	"stopped",
	"suspended",
];
