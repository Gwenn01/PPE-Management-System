import Navbar from '../components/landing/Navbar'
import HeroSection from '../components/landing/HeroSection'
import HighlightsSection from '../components/landing/HighlightsSection'
import AboutSection from '../components/landing/AboutSection'
import FeaturesSection from '../components/landing/FeaturesSection'
import HowItWorksSection from '../components/landing/HowItWorksSection'
import GetStartedSection from '../components/landing/GetStartedSection'
import Footer from '../components/landing/Footer'

export default function LandingPage() {
  return (
    <div className="w-full overflow-x-hidden">
      <Navbar />
      <main>
        <HeroSection />
        <HighlightsSection />
        <AboutSection />
        <FeaturesSection />
        <HowItWorksSection />
        <GetStartedSection />
      </main>
      <Footer />
    </div>
  )
}
