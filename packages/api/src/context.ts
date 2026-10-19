import type { Session } from "@switchyard/auth";
import type { Database } from "@switchyard/db";

export type Context = {
  session: Session | null;
  db: Database;
};
