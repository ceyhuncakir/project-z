import { buttonVariants } from "@switchyard/ui/components/button";
import { Link } from "@tanstack/react-router";

export function NotFound() {
	return (
		<div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
			<p className="label-mono">404 · no route</p>
			<h1 className="font-medium text-2xl tracking-tight">
				This track doesn't go anywhere.
			</h1>
			<Link to="/" className={buttonVariants({ variant: "outline" })}>
				Back to the yard
			</Link>
		</div>
	);
}
