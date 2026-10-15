import type { Album, AlbumInput, Viewer } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (import.meta.env.DEV) {
    const email = localStorage.getItem("snackamusik-dev-email");
    if (email) headers.set("x-dev-user-email", email);
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Något gick fel (felkod ${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const getAlbums = () => request<Album[]>("/api/albums");
export const getViewer = () => request<Viewer>("/api/me");
export const createAlbum = (album: AlbumInput) => request<Album>("/api/albums", { method: "POST", body: JSON.stringify(album) });
export const updateAlbum = (id: string, album: AlbumInput) => request<Album>(`/api/albums/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(album) });
export const deleteAlbum = (id: string) => request<{ ok: true }>(`/api/albums/${encodeURIComponent(id)}`, { method: "DELETE" });
