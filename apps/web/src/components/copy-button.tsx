import { Button } from "@switchyard/ui/components/button";
import { cn } from "@switchyard/ui/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export function CopyButton({
	value,
	className,
	label = "Copy",
}: {
	value: string;
	className?: string;
	label?: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={label}
			className={cn("text-muted-foreground hover:text-foreground", className)}
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? <CheckIcon className="text-go" /> : <CopyIcon />}
		</Button>
	);
}
