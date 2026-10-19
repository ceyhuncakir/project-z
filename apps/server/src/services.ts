import { createAuth } from "@switchyard/auth";
import { createDb } from "@switchyard/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
