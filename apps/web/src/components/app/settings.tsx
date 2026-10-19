import { Label } from "@switchyard/ui/components/label";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";

/** Better Auth's client returns { data, error }; react-query wants a throw. */
export async function unwrap<T>(
	call: Promise<{
		data: T | null;
		error: { message?: string; statusText: string } | null;
	}>,
): Promise<T> {
	const { data, error } = await call;
	if (error) throw new Error(error.message || error.statusText);
	return data as T;
}

/** An absolute web URL, for links the API sends the browser back to. */
export const appUrl = (path: string) => `${window.location.origin}${path}`;

/**
 * Email links and GitHub linking come back with ?error=… when they fail:
 * shows it once and drops it from the URL.
 */
export function useReturnedError(
	error: string | undefined,
	to: "/settings/profile" | "/settings/security",
) {
	const navigate = useNavigate();
	useEffect(() => {
		if (!error) return;
		toast.error(
			error.toLowerCase().includes("token")
				? "That link expired or was already used."
				: `Couldn't finish that: ${error.replaceAll("_", " ").toLowerCase()}.`,
		);
		navigate({ to, search: {}, replace: true });
	}, [error, navigate, to]);
}

/** A labelled row inside a settings panel: label on the left, controls on the right. */
export function SettingsRow({
	label,
	htmlFor,
	hint,
	children,
}: {
	label: string;
	htmlFor?: string;
	hint?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="grid gap-3 px-4 py-4 sm:grid-cols-[200px_1fr]">
			<div>
				<Label htmlFor={htmlFor} className="text-[13px]">
					{label}
				</Label>
				{hint && (
					<p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>
				)}
			</div>
			<div className="min-w-0">{children}</div>
		</div>
	);
}
