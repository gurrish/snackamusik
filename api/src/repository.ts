import { TableClient, type TableEntity } from "@azure/data-tables";
import { BlobServiceClient } from "@azure/storage-blob";
import type { Album, Artwork } from "./domain.js";

export interface Repository {
  listAlbums(): Promise<Album[]>;
  getAlbum(id: string): Promise<Album | undefined>;
  saveAlbum(album: Album): Promise<void>;
  deleteAlbum(id: string): Promise<void>;
  saveArtwork(id: string, artwork: Artwork): Promise<void>;
  readArtwork(id: string): Promise<Artwork | undefined>;
  deleteArtwork(id: string): Promise<void>;
}

type StoredAlbum = TableEntity<Record<string, unknown>>;

function fromEntity(entity: StoredAlbum): Album {
  const { partitionKey: _partitionKey, rowKey, etag: _etag, timestamp: _timestamp, ...fields } = entity;
  const { paid: _paid, estimatedValue: _estimatedValue, ...albumFields } = fields;
  return {
    ...albumFields,
    id: rowKey,
    released: typeof fields.released === "number" ? fields.released : null,
    favouriteTrack: typeof fields.favouriteTrack === "string" ? fields.favouriteTrack : "",
  } as Album;
}

export class MemoryRepository implements Repository {
  private readonly albums = new Map<string, Album>();
  private readonly artworks = new Map<string, Artwork>();

  async listAlbums(): Promise<Album[]> {
    return [...this.albums.values()].map((album) => structuredClone(album));
  }
  async getAlbum(id: string): Promise<Album | undefined> {
    const album = this.albums.get(id);
    return album ? structuredClone(album) : undefined;
  }
  async saveAlbum(album: Album): Promise<void> {
    this.albums.set(album.id, structuredClone(album));
  }
  async deleteAlbum(id: string): Promise<void> {
    this.albums.delete(id);
  }
  async saveArtwork(id: string, artwork: Artwork): Promise<void> {
    this.artworks.set(id, { bytes: Buffer.from(artwork.bytes), contentType: artwork.contentType });
  }
  async readArtwork(id: string): Promise<Artwork | undefined> {
    const artwork = this.artworks.get(id);
    return artwork ? { bytes: Buffer.from(artwork.bytes), contentType: artwork.contentType } : undefined;
  }
  async deleteArtwork(id: string): Promise<void> {
    this.artworks.delete(id);
  }
}

export class TableRepository implements Repository {
  private readonly table: TableClient;
  private readonly blobs: BlobServiceClient;

  constructor(connectionString: string) {
    this.table = TableClient.fromConnectionString(connectionString, "Albums");
    this.blobs = BlobServiceClient.fromConnectionString(connectionString);
  }

  private async ensureTable() {
    await this.table.createTable().catch((error: unknown) => {
      if (!(error instanceof Error) || !("statusCode" in error) || error.statusCode !== 409) throw error;
    });
  }

  async listAlbums(): Promise<Album[]> {
    await this.ensureTable();
    const albums: Album[] = [];
    for await (const entity of this.table.listEntities<StoredAlbum>()) {
      albums.push(fromEntity(entity));
    }
    return albums;
  }

  async getAlbum(id: string): Promise<Album | undefined> {
    try {
      const entity = await this.table.getEntity<StoredAlbum>("albums", id);
      return fromEntity(entity);
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && error.statusCode === 404) return undefined;
      throw error;
    }
  }

  async saveAlbum(album: Album): Promise<void> {
    await this.ensureTable();
    const { id, released, ...fields } = album;
    await this.table.upsertEntity({
      partitionKey: "albums",
      rowKey: id,
      ...fields,
      ...(released === null ? {} : { released }),
    }, "Replace");
  }

  async deleteAlbum(id: string): Promise<void> {
    try {
      await this.table.deleteEntity("albums", id);
    } catch (error) {
      if (!(error instanceof Error) || !("statusCode" in error) || error.statusCode !== 404) throw error;
    }
  }

  private container() {
    return this.blobs.getContainerClient("album-artwork");
  }

  async saveArtwork(id: string, artwork: Artwork): Promise<void> {
    const container = this.container();
    await container.createIfNotExists();
    await container.getBlockBlobClient(`${id}`).uploadData(artwork.bytes, {
      blobHTTPHeaders: { blobContentType: artwork.contentType },
    });
  }

  async readArtwork(id: string): Promise<Artwork | undefined> {
    try {
      const blob = this.container().getBlockBlobClient(id);
      const [bytes, properties] = await Promise.all([blob.downloadToBuffer(), blob.getProperties()]);
      return { bytes, contentType: properties.contentType || "application/octet-stream" };
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && error.statusCode === 404) return undefined;
      throw error;
    }
  }

  async deleteArtwork(id: string): Promise<void> {
    await this.container().getBlockBlobClient(id).deleteIfExists();
  }
}

let repository: Repository | undefined;
export function getRepository(): Repository {
  if (repository) return repository;
  const mode = process.env.STORAGE_MODE ?? (process.env.NODE_ENV === "development" ? "memory" : "table");
  if (mode === "memory") repository = new MemoryRepository();
  else if (mode === "table" && process.env.STORAGE_CONNECTION_STRING) {
    repository = new TableRepository(process.env.STORAGE_CONNECTION_STRING);
  } else {
    throw new Error("Configure STORAGE_CONNECTION_STRING with STORAGE_MODE=table, or use STORAGE_MODE=memory locally.");
  }
  return repository;
}
