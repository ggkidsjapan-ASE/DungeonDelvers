// SHA-256 of the delete key. This repo is public, so only the hash is stored here.
// To change the key: printf 'new-key' | shasum -a 256
const DELETE_KEY_HASH = "ff1ddee54226f8206d7d573c91adebcbbc465ce1e0f655e3d39004cd75706035";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rejectInvalidDeleteKey(key: unknown): Promise<Response | null> {
  if (typeof key === "string" && await sha256(key) === DELETE_KEY_HASH) return null;
  return Response.json({ error: "That delete key is not correct." }, { status: 403 });
}
