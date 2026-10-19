import { z } from "zod";

/** Bytes per parameter for common inference precisions. */
export const LLM_PRECISIONS = { fp16: 2, fp8: 1, int8: 1, int4: 0.5 } as const;
export type LlmPrecision = keyof typeof LLM_PRECISIONS;

export interface LlmPreset {
	id: string;
	name: string;
	paramsB: number;
	/** The precision the weights ship in. */
	precision: LlmPrecision;
}

/** Popular open-weight models, for "what do I need to serve X?" questions. */
export const LLM_MODELS: LlmPreset[] = [
	{ id: "llama-3.1-8b", name: "Llama 3.1 8B", paramsB: 8, precision: "fp16" },
	{ id: "gpt-oss-20b", name: "gpt-oss-20b", paramsB: 21, precision: "int4" },
	{ id: "gemma-3-27b", name: "Gemma 3 27B", paramsB: 27, precision: "fp16" },
	{ id: "qwen2.5-32b", name: "Qwen2.5 32B", paramsB: 32.5, precision: "fp16" },
	{
		id: "mixtral-8x7b",
		name: "Mixtral 8x7B",
		paramsB: 46.7,
		precision: "fp16",
	},
	{
		id: "llama-3.3-70b",
		name: "Llama 3.3 70B",
		paramsB: 70.6,
		precision: "fp16",
	},
	{ id: "gpt-oss-120b", name: "gpt-oss-120b", paramsB: 117, precision: "int4" },
	{
		id: "deepseek-r1",
		name: "DeepSeek-R1 671B",
		paramsB: 671,
		precision: "fp8",
	},
];

export const llmSizingSchema = z
	.object({
		/** A preset id from LLM_MODELS. */
		model: z.string().optional(),
		/** Parameter count in billions, for models without a preset. */
		paramsB: z.number().positive().max(5_000).optional(),
		/** Defaults to the preset's native precision, else fp16. */
		precision: z.enum(["fp16", "fp8", "int8", "int4"]).optional(),
	})
	.refine((v) => v.model || v.paramsB, {
		message: "Pass a model preset or paramsB",
	});

export type LlmSizingInput = z.infer<typeof llmSizingSchema>;

/**
 * Rule of thumb: weights × 1.2, leaving ~20% for KV cache and activations at
 * moderate context lengths. Long contexts or big batches need more.
 */
export function estimateVramGb(
	paramsB: number,
	precision: LlmPrecision,
): number {
	return Math.ceil(paramsB * LLM_PRECISIONS[precision] * 1.2);
}

export function resolveLlm(input: LlmSizingInput) {
	const preset = input.model
		? LLM_MODELS.find((m) => m.id === input.model)
		: undefined;
	if (input.model && !preset && !input.paramsB) {
		throw new Error(
			`Unknown model "${input.model}". Known: ${LLM_MODELS.map((m) => m.id).join(", ")}, or pass paramsB.`,
		);
	}
	const paramsB = input.paramsB ?? preset?.paramsB ?? 0;
	const precision = input.precision ?? preset?.precision ?? "fp16";
	return {
		model: preset?.name ?? `${paramsB}B parameters`,
		paramsB,
		precision,
		vramGb: estimateVramGb(paramsB, precision),
	};
}
