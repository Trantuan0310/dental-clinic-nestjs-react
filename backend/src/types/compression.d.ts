declare module 'compression' {
  import { RequestHandler } from 'express';
  interface CompressionOptions {
    level?: number;
    threshold?: number;
    filter?: (req: any, res: any) => boolean;
  }
  function compression(options?: CompressionOptions): RequestHandler;
  export = compression;
}
