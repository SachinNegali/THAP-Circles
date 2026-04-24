/**
 * Ambient declarations for the `multer` CommonJS module and the
 * `Express.Multer.File` global namespace it augments.
 */

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination?: string;
      filename?: string;
      path?: string;
      buffer: Buffer;
    }
  }
}

declare module 'multer' {
  import { RequestHandler } from 'express';

  interface StorageEngine {
    _handleFile(
      req: unknown,
      file: Express.Multer.File,
      cb: (err: unknown, info?: Partial<Express.Multer.File>) => void
    ): void;
    _removeFile(
      req: unknown,
      file: Express.Multer.File,
      cb: (err: unknown) => void
    ): void;
  }

  interface Options {
    storage?: StorageEngine;
    limits?: { fileSize?: number };
  }

  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    any(): RequestHandler;
    none(): RequestHandler;
  }

  function multer(options?: Options): Multer;

  namespace multer {
    function memoryStorage(): StorageEngine;
    function diskStorage(options: unknown): StorageEngine;
  }

  export = multer;
}
