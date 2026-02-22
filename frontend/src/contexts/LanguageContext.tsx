"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Language = 'cs' | 'ua' | 'ru' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("cs");

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lakodi_lang') ?? localStorage.getItem('lakodi-lang');
      if (saved === 'ua') setLanguageState('ua');
      if (saved === 'ru') setLanguageState('ru');
      if (saved === 'en') setLanguageState('en');
    } catch {
      // ignore storage errors
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('lakodi_lang', lang);
      localStorage.setItem('lakodi-lang', lang);
    } catch {
      // ignore storage errors
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}
