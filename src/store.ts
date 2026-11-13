export interface DocumentWriterLike {
  set(data: Record<string, unknown>, options?: {mergeFields: string[]}): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface QueryDocumentLike {
  readonly id: string;
  readonly ref: {readonly path: string};
  data(): unknown;
}

export interface QuerySnapshotLike {
  readonly empty: boolean;
  readonly size: number;
  readonly docs: readonly QueryDocumentLike[];
}

export interface QueryLike {
  where(field: string, op: "==", value: string): QueryLike;
  startAfter(document: QueryDocumentLike): QueryLike;
  limit(limit: number): QueryLike;
  get(): Promise<QuerySnapshotLike>;
}

export interface KitFirestore {
  doc(path: string): DocumentWriterLike;
  collection(collectionPath: string): QueryLike;
  collectionGroup(collectionId: string): QueryLike;
}
