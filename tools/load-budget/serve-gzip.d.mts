// Type declarations for tools/load-budget/serve-gzip.mjs.
import type { Server } from "node:http";

export const MIN_COMPRESS: number;
export const MAX_COMPRESS: number;
export function shouldCompress(contentType: string, size: number, acceptEncoding?: string): boolean;
export function createGzipServer(root: string): Server;
