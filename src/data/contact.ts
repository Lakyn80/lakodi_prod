export const CONTACT = {
  phone: '+420 123 456 789',
  phoneRaw: '+420123456789',
  whatsapp: '420123456789',
  address: {
    cs: 'Praha – Uhříněves',
    ua: 'Прага – Угржіневес',
  },
  openingHours: {
    cs: 'Po–Pá: 8:00–17:00',
    ua: 'Пн–Пт: 8:00–17:00',
  },
  mapUrl: 'https://maps.google.com/?q=Praha+Uhříněves',
  getWhatsAppUrl: (message?: string) =>
    `https://wa.me/420123456789${message ? `?text=${encodeURIComponent(message)}` : ''}`,
  getPhoneUrl: () => 'tel:+420123456789',
};
