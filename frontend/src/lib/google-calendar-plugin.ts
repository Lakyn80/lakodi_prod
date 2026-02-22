export interface GoogleCalendarPluginStatus {
  connected: boolean;
  message: string;
}

export const googleCalendarPlugin = {
  getStatus(): GoogleCalendarPluginStatus {
    return {
      connected: false,
      message: "Google Calendar modul je připraven jako placeholder pro budoucí API napojení.",
    };
  },
};
