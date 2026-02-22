const PHONE_RAW = '+420776053625';
const WHATSAPP_NUM = '420776053625';

export const CONTACT = {
  phone: '+420 776 053 625',
  phoneRaw: PHONE_RAW,
  whatsapp: WHATSAPP_NUM,
  address: {
    cs: 'K Netlukám 93, 14000 Praha 22',
    ua: 'K Netlukám 93, 14000 Praha 22',
    ru: 'K Netlukám 93, 14000 Praha 22',
    en: 'K Netlukám 93, 14000 Prague 22',
  },
  openingHours: {
    cs: 'Po–So: 9:00–20:00',
    ua: 'Пн–Сб: 9:00–20:00',
    ru: 'Пн–Сб: 9:00–20:00',
    en: 'Mon–Sat: 9:00–20:00',
  },
  mapUrl: 'https://maps.app.goo.gl/Ree3ZTPLj9pi6zhq9',
  getWhatsAppUrl: (message?: string) =>
    `https://wa.me/${WHATSAPP_NUM}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
  getPhoneUrl: () => `tel:${PHONE_RAW}`,
};
