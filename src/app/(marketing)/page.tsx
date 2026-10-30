import { LandingNavbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { ProblemSection } from "@/components/landing/problem-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CtaSection } from "@/components/landing/footer-cta";
import { Footer } from "@/components/landing/footer";

/**
 * LANDING PAGE — BIZMATE
 * Semua section dibangun dari komponen di src/components/landing/*.
 */
export default function LandingPage() {
  return (
    <div className="bg-background">
      <LandingNavbar />
      <main>
        <Hero />
        <ProblemSection />
        <FeaturesSection />
        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
