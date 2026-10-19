import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";

import { Comparison } from "@/components/marketing/comparison";
import { Connect } from "@/components/marketing/connect";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Guardrails } from "@/components/marketing/guardrails";
import { Hero, providersQuery } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LlmSizer, llmModelsQuery } from "@/components/marketing/llm-sizer";
import { BOARDS, PriceBoard } from "@/components/marketing/price-board";
import { Pricing } from "@/components/marketing/pricing";
import { ProviderMarquee } from "@/components/marketing/provider-marquee";
import { SectionIntro } from "@/components/marketing/section";
import { ProductShowcase } from "@/components/marketing/showcase/product-showcase";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { UseCases } from "@/components/marketing/use-cases";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.prefetchQuery(providersQuery),
			context.queryClient.prefetchQuery(llmModelsQuery),
			context.queryClient.prefetchQuery(
				orpc.catalog.sizeLlm.queryOptions({ input: { model: "llama-3.3-70b", precision: undefined } }),
			),
			...BOARDS.map((b) => context.queryClient.prefetchQuery(b.query)),
		]),
	component: Landing,
});

function Landing() {
	return (
		// Honour the OS "reduce motion" setting for every animation on the page.
		<MotionConfig reducedMotion="user">
			<div className="flex min-h-svh flex-col">
				<SiteHeader />
				<main className="flex-1">
					<Hero />
					<ProviderMarquee />
					<section className="mx-auto max-w-6xl px-5 py-24">
						<SectionIntro
							index="01"
							label="See it work"
							title="Watch an agent run its own infrastructure."
							lede="A scripted demo built from the real MCP tools: provisioning with per-minute billing, routing around a sold-out plan, and sizing GPUs for an open model. Hover to pause."
						/>
						<ProductShowcase className="mt-10" />
					</section>
					<HowItWorks />
					<UseCases />
					<Features />
					<LlmSizer />
					<PriceBoard />
					<Comparison />
					<Connect />
					<Guardrails />
					<Pricing />
					<section className="mx-auto max-w-3xl px-5 py-24">
						<SectionIntro index="11" label="Questions" title="Good to know" />
						<div className="mt-10">
							<Faq />
						</div>
					</section>
					<FinalCta />
				</main>
				<SiteFooter />
			</div>
		</MotionConfig>
	);
}
