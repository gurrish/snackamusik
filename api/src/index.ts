import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { createAlbumInput, updateAlbumInput, type Album, type Artwork, type ArtworkInput } from "./domain.js";
import { getRepository } from "./repository.js";

interface Identity {
  id: string;
  email: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function identity(request: HttpRequest): Identity | undefined {
  const encoded = request.headers.get("x-ms-client-principal");
  if (!encoded && process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production") {
    const email = (request.headers.get("x-dev-user-email") || process.env.DEV_AUTH_EMAIL || "").trim().toLowerCase();
    return email ? { id: email, email } : undefined;
  }
  if (!encoded) return undefined;

  try {
    const principal: unknown = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!principal || typeof principal !== "object" || !("userDetails" in principal) || !("userId" in principal)) return undefined;
    const { userDetails, userId } = principal;
    if (typeof userDetails !== "string" || typeof userId !== "string" || !userDetails.includes("@")) return undefined;
    return { id: userId, email: userDetails.trim().toLowerCase() };
  } catch {
    return undefined;
  }
}

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.GLOBAL_ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

function requireAdmin(request: HttpRequest) {
  const actor = identity(request);
  if (!actor) throw new HttpError(401, "Logga in för att göra ändringar.");
  if (!isAdmin(actor.email)) throw new HttpError(403, "Det här kontot har inte behörighet att redigera skivdagboken.");
  return actor;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBody(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Begäran innehåller ogiltig JSON.");
  }
}

function parseArtwork(input: ArtworkInput): Artwork {
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new HttpError(400, "Bilden måste vara högst 8 MB.");
  const signatures: Record<ArtworkInput["contentType"], number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "image/webp": [0x52, 0x49, 0x46, 0x46],
  };
  const signature = signatures[input.contentType];
  if (!signature.every((byte, index) => bytes[index] === byte)
    || (input.contentType === "image/webp" && bytes.toString("ascii", 8, 12) !== "WEBP")) {
    throw new HttpError(400, "Den uppladdade filen stämmer inte överens med bildformatet.");
  }
  return { bytes, contentType: input.contentType };
}

function publicAlbum(album: Album): Album & { artworkUrl: string } {
  return { ...album, artworkUrl: `/api/albums/${encodeURIComponent(album.id)}/artwork` };
}

function responsePath(pathname: string): string[] {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, "Adressen innehåller ogiltig kodning.");
  }
}

export async function handle(request: HttpRequest, context: InvocationContext): Promise<Response> {
  try {
    const [api, resource, id, action] = responsePath(new URL(request.url).pathname);
    if (api !== "api") throw new HttpError(404, "API-adressen kunde inte hittas.");
    const method = request.method.toUpperCase();
    const repo = getRepository();

    if (resource === "me" && method === "GET") {
      const actor = identity(request);
      return json({ signedIn: Boolean(actor), email: actor?.email ?? null, isAdmin: isAdmin(actor?.email) });
    }
    if (resource !== "albums") throw new HttpError(404, "API-adressen kunde inte hittas.");
    if (!id && method === "GET") {
      const albums = await repo.listAlbums();
      albums.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      return json(albums.map(publicAlbum));
    }
    if (id && action === "artwork" && method === "GET") {
      const album = await repo.getAlbum(id);
      if (!album) throw new HttpError(404, "Skivan kunde inte hittas.");
      const artwork = await repo.readArtwork(id);
      if (!artwork) throw new HttpError(404, "Omslagsbilden kunde inte hittas.");
      return new Response(artwork.bytes, {
        headers: {
          "Content-Type": artwork.contentType,
          "Cache-Control": "public, max-age=0, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (!id && method === "POST") {
      requireAdmin(request);
      const parsed = createAlbumInput.safeParse(await readBody(request));
      if (!parsed.success) throw new HttpError(400, "Kontrollera albumuppgifterna och försök igen.");
      const { artwork: artworkInput, ...details } = parsed.data;
      const album: Album = {
        id: randomUUID(),
        ...details,
        artworkContentType: artworkInput.contentType,
        artworkName: artworkInput.name,
        createdAt: new Date().toISOString(),
      };
      await repo.saveArtwork(album.id, parseArtwork(artworkInput));
      try {
        await repo.saveAlbum(album);
      } catch (error) {
        await repo.deleteArtwork(album.id);
        throw error;
      }
      return json(publicAlbum(album), 201);
    }
    if (id && !action && method === "PUT") {
      requireAdmin(request);
      const current = await repo.getAlbum(id);
      if (!current) throw new HttpError(404, "Skivan kunde inte hittas.");
      const parsed = updateAlbumInput.safeParse(await readBody(request));
      if (!parsed.success) throw new HttpError(400, "Kontrollera albumuppgifterna och försök igen.");
      const { artwork: artworkInput, ...details } = parsed.data;
      const updated: Album = {
        ...current,
        ...details,
        ...(artworkInput ? { artworkContentType: artworkInput.contentType, artworkName: artworkInput.name } : {}),
      };
      if (artworkInput) await repo.saveArtwork(id, parseArtwork(artworkInput));
      await repo.saveAlbum(updated);
      return json(publicAlbum(updated));
    }
    if (id && !action && method === "DELETE") {
      requireAdmin(request);
      if (!await repo.getAlbum(id)) throw new HttpError(404, "Skivan kunde inte hittas.");
      await repo.deleteArtwork(id);
      await repo.deleteAlbum(id);
      return json({ ok: true });
    }
    throw new HttpError(404, "API-adressen kunde inte hittas.");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    context.error("Request failed", error);
    return json({ error: "Begäran kunde inte slutföras. Försök igen senare." }, 500);
  }
}

app.http("api", {
  route: "{*path}",
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  handler: handle,
});
