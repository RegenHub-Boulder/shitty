/// <reference types="bun-types" />

// Bun global types
declare global {
  const Bun: typeof import("bun");
}

// Explicit module declarations for Bun built-ins
declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string);
    query(sql: string): {
      get(params?: any): any;
      all(params?: any): any[];
      run(params?: any): any;
    };
    exec(sql: string): void;
    close(): void;
  }
}