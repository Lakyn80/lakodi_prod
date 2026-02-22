export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8016";

export function zakazkyUrl(path = "") {
  return `${API_BASE}/api/zakazky${path}`;
}

export function adminApiUrl(path = "") {
  return `${API_BASE}/api/admin${path}`;
}

export const apiFetchOptions: RequestInit = {
  credentials: "include",
};

export function uploadsUrl(filename: string) {
  return `${API_BASE}/api/uploads/${filename}`;
}

export function galleryUrl(path = "") {
  return `${API_BASE}/api/gallery${path}`;
}

export function galleryAdminUrl(path = "") {
  return `${API_BASE}/api/admin/gallery${path}`;
}
