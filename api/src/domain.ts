import { z } from "zod";

const artworkInput = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(1).max(11_184_812).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Bilden har ett ogiltigt format."),
}).strict();

const albumFields = {
  artist: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  released: z.number().int().min(1900).max(new Date().getFullYear() + 1).nullable(),
  format: z.enum(["Vinyl", "CD"]),
  albumScore: z.number().min(0).max(5).multipleOf(0.5),
  artworkScore: z.number().min(0).max(5).multipleOf(0.5),
  favouriteTrack: z.string().trim().max(200),
  thoughts: z.string().trim().max(3000),
};

export const createAlbumInput = z.object({ ...albumFields, artwork: artworkInput }).strict();
export const updateAlbumInput = z.object({ ...albumFields, artwork: artworkInput.optional() }).strict();
export type AlbumInput = z.infer<typeof updateAlbumInput>;
export type ArtworkInput = z.infer<typeof artworkInput>;

export interface Album {
  id: string;
  artist: string;
  title: string;
  released: number | null;
  format: "Vinyl" | "CD";
  albumScore: number;
  artworkScore: number;
  favouriteTrack: string;
  thoughts: string;
  artworkContentType: string;
  artworkName: string;
  createdAt: string;
}

export interface Artwork {
  bytes: Buffer;
  contentType: string;
}
