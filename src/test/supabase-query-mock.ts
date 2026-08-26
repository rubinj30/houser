import { vi } from "vitest";

export type SupabaseResult = {
  data: unknown;
  error: { message: string } | null;
};

export function queryResult(data: unknown = null, error: SupabaseResult["error"] = null) {
  const result: SupabaseResult = { data, error };
  const query = {
    ...result,
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  for (const method of ["select", "eq", "is", "gt", "limit", "insert", "update", "upsert", "delete"] as const) {
    query[method].mockReturnValue(query);
  }
  return query;
}

export type QueryMock = ReturnType<typeof queryResult>;

export function queuedSupabaseClient({
  claims = { sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  tables,
  storage,
}: {
  claims?: { sub?: string } | null;
  tables: Record<string, QueryMock[]>;
  storage?: {
    createSignedUploadUrl?: ReturnType<typeof vi.fn>;
    createSignedUrl?: ReturnType<typeof vi.fn>;
  };
}) {
  const queues = Object.fromEntries(Object.entries(tables).map(([table, queries]) => [table, [...queries]]));
  const storageApi = {
    createSignedUploadUrl: storage?.createSignedUploadUrl ?? vi.fn(),
    createSignedUrl: storage?.createSignedUrl ?? vi.fn(),
  };
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: claims ? { claims } : null, error: null })),
    },
    from: vi.fn((table: string) => {
      const query = queues[table]?.shift();
      if (!query) throw new Error(`No queued Supabase query for ${table}`);
      return query;
    }),
    storage: {
      from: vi.fn(() => storageApi),
    },
    storageApi,
  };
}
