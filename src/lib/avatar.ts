// Profile photo uploads, typed by their bytes and then decoded and re-encoded as a small square WebP,
// so what Cadence stores and serves is always an image it made (no EXIF location, no polyglot files).
import sharp from "sharp";
import { sniff } from "@/lib/link-preview";
import { ServiceError } from "@/services/errors";

export const AVATAR = {
  /** Largest upload accepted. */
  maxBytes: 2 * 1024 * 1024,
  /** Stored edge length in pixels: crisp on a 2x screen at the largest size the app shows. */
  size: 256,
  types: ["image/png", "image/jpeg", "image/webp"] as readonly string[],
} as const;

/** Where the owner fetches, replaces and removes their photo (src/app/app/settings/photo/route.ts). */
export const AVATAR_PATH = "/app/settings/photo";

/** Decode an upload and crop it to a square around its most salient region (sharp's "attention" strategy,
 *  which weighs skin tones and detail, so usually the face). */
export async function squareAvatar(data: Buffer): Promise<Buffer> {
  if (data.length > AVATAR.maxBytes) throw new ServiceError("invalid", "That photo is over the 2 MB limit.");
  const mime = sniff(data);
  if (!mime || !AVATAR.types.includes(mime)) throw new ServiceError("invalid", "Use a PNG, JPEG or WebP photo.");
  try {
    // limitInputPixels guards against a tiny file that decodes to a huge image.
    return await sharp(data, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate() // honour the camera's orientation before cropping
      .resize(AVATAR.size, AVATAR.size, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ServiceError("invalid", "That photo couldn't be read. Try another PNG, JPEG or WebP.");
  }
}
