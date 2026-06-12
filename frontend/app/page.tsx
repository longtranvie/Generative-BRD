import Link from "next/link";
import Hero from "@/components/landing/Hero";
import PipelineShowcase from "@/components/landing/PipelineShowcase";
import ArchitectureSection from "@/components/landing/ArchitectureSection";
import MemorySection from "@/components/landing/MemorySection";
import ApiSection from "@/components/landing/ApiSection";
import CodeBrowser from "@/components/landing/CodeBrowser";

export default function Landing() {
  return (
    <main className="relative z-10">
      <Hero />
      <PipelineShowcase />
      <ArchitectureSection />
      <MemorySection />
      <ApiSection />
      <CodeBrowser />

      <section className="relative px-6 md:px-10 py-14 md:py-20 bg-white border-t border-line">
        <div className="max-w-[1100px] mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
            See it live
          </h2>
          <p className="text-[0.95rem] text-muted leading-relaxed max-w-xl mx-auto mb-7">
            Upload a discovery doc, set per-section emphasis, watch the
            pipeline execute, give feedback, and ship the final BRD. The tour
            guide auto-opens on first visit.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/app" className="btn-cta">
              Try the app →
            </Link>
            <Link href="/app" className="btn-ghost">
              I just want the demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-6 md:px-10 py-8 text-center text-[0.78rem] text-muted">
        <p>
          BRD Agent — built on LangGraph, FastAPI, Next.js. No tracking, no
          analytics, single-session at a time.
        </p>
      </footer>
    </main>
  );
}
