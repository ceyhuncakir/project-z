import type { AuthEmail } from "@switchyard/auth";
import nodemailer from "nodemailer";

import { ENV } from "./env.server";

const transport = ENV.SMTP_URL
	? nodemailer.createTransport(ENV.SMTP_URL)
	: null;

/** Sends through SMTP_URL, or prints the email when it isn't set. */
export async function sendEmail(email: AuthEmail) {
	if (!transport) {
		console.log(`[email] to ${email.to}: ${email.subject}\n\n${email.text}`);
		return;
	}
	await transport.sendMail({ from: ENV.EMAIL_FROM, ...email });
}
