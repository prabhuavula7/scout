import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Boxes, GitBranch, MessageSquareText, Workflow } from "lucide-react";
import { ThemeToggle } from "@integration-scout/ui";
import { ScoutReticleBackground } from "@/components/scout-reticle-background";
import { AetherFlowBackground } from "@/components/aether-flow-background";

const FEATURES = [
  {
    icon: Boxes,
    title: "Import anything",
    description:
      "OpenAPI, Swagger, GraphQL introspection, GitHub repos, Postman collections, or a raw docs URL.",
  },
  {
    icon: GitBranch,
    title: "AI understanding",
    description:
      "Auth flows, data models, entity relationships, and pitfalls, generated from what's actually in the docs, cited, never invented.",
  },
  {
    icon: Workflow,
    title: "Integration planning",
    description:
      "Ask for a sync strategy between two platforms and get architecture, sequence diagrams, and failure handling.",
  },
  {
    icon: MessageSquareText,
    title: "Grounded chat",
    description: "RAG-powered Q&A over the crawled documentation, with inline source citations.",
  },
];

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="min-h-screen">
      <section className="relative flex min-h-[640px] items-center overflow-hidden px-6 pt-32 pb-20 text-center">
        <AetherFlowBackground />
        <ScoutReticleBackground />

        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="font-serif text-base font-medium tracking-tight">Integration Scout</span>
          <nav className="flex items-center gap-4 text-sm text-stone-600 dark:text-stone-400">
            <Link href={"/sign-in" as Route} className="hover:text-stone-900 dark:hover:text-stone-100">
              Sign in
            </Link>
            <Link
              href={"/sign-up" as Route}
              className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
            >
              Get started
            </Link>
            <ThemeToggle />
          </nav>
        </header>

        <div className="relative mx-auto w-full max-w-4xl">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            Understand any enterprise platform in minutes.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            Point Integration Scout at an unfamiliar API (OpenAPI spec, docs site, or GitHub repo)
            and get a complete, cited integration blueprint: auth flow, data model, workflows, and a
            grounded chat assistant.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href={"/sign-up" as Route}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
            >
              Start a project <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-32">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-800">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="bg-white p-8 dark:bg-stone-950">
              <feature.icon className="h-5 w-5 text-accent-500" strokeWidth={1.75} />
              <h3 className="mt-4 font-serif text-lg font-medium">{feature.title}</h3>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
