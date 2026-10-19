import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export { newId } from "./ids";

export function createDb(env: DatabaseConfig) {
	return drizzle(env.DATABASE_URL, { relations });
}

export type Database = ReturnType<typeof createDb>;
/** A database handle or an open transaction. */
export type Executor =
	| Database
	| Parameters<Parameters<Database["transaction"]>[0]>[0];
