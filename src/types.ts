export interface Album {
  id: string;
  artist: string;
  title: string;
  released: number | null;
  format: "Vinyl" | "CD";
  albumScore: number;
  artworkScore: number;
  paid: number;
  estimatedValue: number;
  thoughts: string;
  artworkContentType: string;
  artworkName: string;
  createdAt: string;
  artworkUrl: string;
}

export interface AlbumInput {
  artist: string;
  title: string;
  released: number | null;
  format: "Vinyl" | "CD";
  albumScore: number;
  artworkScore: number;
  paid: number;
  estimatedValue: number;
  thoughts: string;
  artwork?: { name: string; contentType: string; base64: string };
}

export interface Viewer {
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}
