"use client";

import { createContext, useContext, useState, useCallback, type MouseEvent, type ReactNode } from "react";

interface ChatbotContextType {
  isOpen: boolean;
  mode: "chat" | "booking";
  openChatbot: {
    (mode?: "chat" | "booking"): void;
    (event: MouseEvent<HTMLElement>): void;
  };
  closeChatbot: () => void;
}

const ChatbotContext = createContext<ChatbotContextType | null>(null);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "booking">("chat");
  const openChatbot: ChatbotContextType["openChatbot"] = useCallback((value?: "chat" | "booking" | MouseEvent<HTMLElement>) => {
    setMode(value === "booking" ? "booking" : "chat");
    setIsOpen(true);
  }, []);
  const closeChatbot = useCallback(() => setIsOpen(false), []);

  return (
    <ChatbotContext.Provider value={{ isOpen, mode, openChatbot, closeChatbot }}>
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}
