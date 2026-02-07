import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, MessageCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { translations } from '@/data/translations';
import { CONTACT } from '@/data/contact';
import { useToast } from '@/hooks/use-toast';

interface FormData {
  name: string;
  phone: string;
  carBrand: string;
  carModel: string;
  problem: string;
  preferredDate?: string;
}

export default function BookingForm() {
  const { language } = useLanguage();
  const t = translations[language];
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);

  const schema = z.object({
    name: z.string().min(1, t.booking.validation.nameRequired),
    phone: z
      .string()
      .min(1, t.booking.validation.phoneRequired)
      .regex(/^[\d\s+()-]{6,}$/, t.booking.validation.phoneInvalid),
    carBrand: z.string().min(1, t.booking.validation.brandRequired),
    carModel: z.string().min(1, t.booking.validation.modelRequired),
    problem: z.string().min(1, t.booking.validation.problemRequired),
    preferredDate: z.string().optional(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    setFormData(data);
    setSubmitted(true);
    toast({ title: t.booking.success });
  };

  const getWhatsAppMessage = () => {
    if (!formData) return '';
    const lines = [
      'Nová poptávka z webu Lakodi autoslužby',
      '',
      `Jméno: ${formData.name}`,
      `Telefon: ${formData.phone}`,
      `Značka: ${formData.carBrand}`,
      `Model: ${formData.carModel}`,
      `Problém: ${formData.problem}`,
    ];
    if (formData.preferredDate) lines.push(`Termín: ${formData.preferredDate}`);
    return lines.join('\n');
  };

  if (submitted) {
    return (
      <section id="booking" className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-primary/30 bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">{t.booking.success}</h3>
            <a
              href={CONTACT.getWhatsAppUrl(getWhatsAppMessage())}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="mt-4 gap-2" size="lg">
                <MessageCircle className="h-5 w-5" />
                {t.booking.sendWhatsApp}
              </Button>
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="border-y border-border bg-secondary py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.booking.title}</h2>
          <p className="mt-3 text-muted-foreground">{t.booking.subtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">{t.booking.name}</Label>
            <Input id="name" {...register('name')} className="bg-card" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t.booking.phone}</Label>
            <Input id="phone" {...register('phone')} className="bg-card" />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carBrand">{t.booking.carBrand}</Label>
            <Input id="carBrand" {...register('carBrand')} className="bg-card" />
            {errors.carBrand && (
              <p className="text-xs text-destructive">{errors.carBrand.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carModel">{t.booking.carModel}</Label>
            <Input id="carModel" {...register('carModel')} className="bg-card" />
            {errors.carModel && (
              <p className="text-xs text-destructive">{errors.carModel.message}</p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="problem">{t.booking.problem}</Label>
            <Textarea id="problem" {...register('problem')} rows={3} className="bg-card" />
            {errors.problem && (
              <p className="text-xs text-destructive">{errors.problem.message}</p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="preferredDate">{t.booking.preferredDate}</Label>
            <Input
              id="preferredDate"
              type="date"
              {...register('preferredDate')}
              className="bg-card"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" className="w-full gap-2 text-base font-bold">
              <CalendarDays className="h-5 w-5" />
              {t.booking.submit}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
