import Hero from '@/components/home/Hero';
import ServicesGrid from '@/components/home/ServicesGrid';
import HowItWorks from '@/components/home/HowItWorks';
import Gallery from '@/components/home/Gallery';
import BookingForm from '@/components/home/BookingForm';
import ContactTeaser from '@/components/home/ContactTeaser';

const Index = () => {
  return (
    <>
      <Hero />
      <ServicesGrid />
      <HowItWorks />
      <Gallery />
      <BookingForm />
      <ContactTeaser />
    </>
  );
};

export default Index;
