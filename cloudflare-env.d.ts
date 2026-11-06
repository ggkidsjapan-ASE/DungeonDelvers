declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}

declare module "qrcode" {
  const QRCode: {
    toDataURL(
      text: string,
      options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } },
    ): Promise<string>;
  };
  export default QRCode;
}
