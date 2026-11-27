import { apiUrl } from "@/lib/api/client";
import { bool, list, num, numOrNull, obj, oneOf, str, strOrNull, withoutInvalid } from "@/lib/api/parse";
import { PHOTO_STATES, type Photo } from "@/lib/types";

export function absoluteUrl(url: string, base?: string | null): string {
  return /^https?:\/\//.test(url) ? url : apiUrl(url, base);
}

function photo(v: unknown, base?: string | null): Photo {
  const o = obj(v, "photos[]");
  return {
    id: str(o, "id"),
    paradeId: strOrNull(o, "paradeId"),
    metres: numOrNull(o, "metres"),
    state: oneOf(PHOTO_STATES, o, "state"),
    createdAt: num(o, "createdAt"),
    url: absoluteUrl(str(o, "url"), base),
  };
}

export function parsePhotos(json: unknown, base?: string | null): Photo[] {
  return withoutInvalid(list(obj(json, "the photos").photos, "photos"), (v) => photo(v, base), "a photo");
}

export interface UploadGrant {
  id: string;
  uploadUrl: string;
  contentType: string;
  token: string;
  expiresAt: number;
}

export function parseUploadGrant(json: unknown, base?: string | null): UploadGrant {
  const o = obj(json, "the upload");
  return {
    id: str(o, "id"),
    uploadUrl: absoluteUrl(str(o, "uploadUrl"), base),
    contentType: str(o, "contentType"),
    token: str(o, "token"),
    expiresAt: num(o, "expiresAt"),
  };
}

export interface PushStatus {
  configured: boolean;
  key: string | null;
}

export function parsePushStatus(json: unknown): PushStatus {
  const o = obj(json, "the push status");
  return { configured: bool(o, "configured"), key: strOrNull(o, "key") };
}
