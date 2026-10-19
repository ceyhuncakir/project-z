import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<div className="flex h-full items-center justify-center pt-16">
			<Loader2 className="size-4 animate-spin text-muted-foreground" />
		</div>
	);
}
