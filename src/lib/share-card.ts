import type { Album } from "../types";

const cardWidth = 1080;
const cardHeight = 1350;

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let lastLine = `${visibleLines[maxLines - 1]}…`;
    while (lastLine.length > 1 && context.measureText(lastLine).width > maxWidth) {
      lastLine = `${lastLine.slice(0, -2)}…`;
    }
    visibleLines[maxLines - 1] = lastLine;
  }

  visibleLines.forEach((visibleLine, index) => context.fillText(visibleLine, x, y + index * lineHeight));
}

export async function createAlbumShareImage(album: Album) {
  const image = new Image();
  image.src = album.artworkUrl;
  try {
    await image.decode();
  } catch {
    throw new Error("Omslaget kunde inte läsas in. Försök igen om en stund.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Det gick inte att skapa delningsbilden.");

  context.fillStyle = "#f5f1e8";
  context.fillRect(0, 0, cardWidth, cardHeight);

  context.fillStyle = "#20221d";
  context.font = "600 20px 'DM Mono', monospace";
  context.letterSpacing = "3px";
  context.fillText("SNACKA MUSIK", 78, 75);
  context.textAlign = "right";
  context.fillStyle = "#77796d";
  context.font = "500 17px 'DM Mono', monospace";
  context.letterSpacing = "1.5px";
  context.fillText(`${album.format.toUpperCase()}${album.released ? ` · ${album.released}` : ""}`, 1002, 75);
  context.textAlign = "left";

  const imageX = 72;
  const imageY = 115;
  const imageSize = 936;
  const scale = Math.max(imageSize / image.naturalWidth, imageSize / image.naturalHeight);
  const sourceWidth = imageSize / scale;
  const sourceHeight = imageSize / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, imageX, imageY, imageSize, imageSize);

  context.fillStyle = "#20221d";
  context.font = "700 44px 'Playfair Display', Georgia, serif";
  context.letterSpacing = "0px";
  drawWrappedText(context, album.title, 78, 1120, 740, 50, 2);
  context.fillStyle = "#77766a";
  context.font = "500 24px 'DM Sans', sans-serif";
  drawWrappedText(context, album.artist, 80, 1225, 730, 30, 1);

  context.textAlign = "right";
  context.fillStyle = "#8c8b7e";
  context.font = "500 15px 'DM Mono', monospace";
  context.letterSpacing = "1.5px";
  context.fillText("ALBUMBETYG", 1000, 1137);
  context.fillStyle = "#20221d";
  context.font = "700 48px 'Playfair Display', Georgia, serif";
  context.letterSpacing = "0px";
  context.fillText(`${album.albumScore.toFixed(album.albumScore % 1 ? 1 : 0)}/5`, 1000, 1192);
  context.textAlign = "left";

  if (album.favouriteTrack.trim()) {
    context.strokeStyle = "#ded9cd";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(78, 1260);
    context.lineTo(1002, 1260);
    context.stroke();
    context.fillStyle = "#89877b";
    context.font = "500 14px 'DM Mono', monospace";
    context.letterSpacing = "1.5px";
    context.fillText("FAVORITLÅT", 80, 1290);
    context.fillStyle = "#20221d";
    context.font = "600 24px 'DM Sans', sans-serif";
    context.letterSpacing = "0px";
    drawWrappedText(context, album.favouriteTrack, 80, 1325, 920, 28, 1);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Det gick inte att skapa delningsbilden.");
  return blob;
}

export function shareAlbum(album: Album, blob: Blob) {
  const filename = `${album.artist}-${album.title}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "-");
  const file = new File([blob], `snackamusik-${filename || "album"}.png`, { type: "image/png" });
  const text = [
    `${album.title} – ${album.artist}`,
    `Album: ${album.albumScore.toFixed(album.albumScore % 1 ? 1 : 0)}/5`,
    album.favouriteTrack.trim() ? `Favoritlåt: ${album.favouriteTrack}` : "",
  ].filter(Boolean).join("\n");
  const shareData = { files: [file], title: `${album.title} – ${album.artist}`, text };

  if (navigator.canShare?.(shareData) && navigator.share) {
    return navigator.share(shareData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      throw new Error("Delningen misslyckades. Försök igen eller spara bilden från en enhet som stöder delning.");
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
}
