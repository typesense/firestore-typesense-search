import type {DocumentChangeLike} from "../../../src/indexOnWrite.js";
import type {DocumentWriterLike, KitFirestore, QueryLike} from "../../../src/store.js";

export type Data = Readonly<Record<string, unknown>>;

export interface RecordedWrite {
  readonly kind: "set" | "delete";
  readonly path: string;
  readonly data?: Data;
  readonly mergeFields?: readonly string[];
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

function parentOf(path: string): string {
  return segmentsOf(path).slice(0, -1).join("/");
}

function idOf(path: string): string {
  return segmentsOf(path).at(-1) ?? path;
}

type Selector = (path: string, data: Data) => boolean;

export class FakeFirestore implements KitFirestore {
  reads = 0;
  failingWrites = 0;
  readonly writes: RecordedWrite[] = [];
  readonly documents = new Map<string, Data>();

  read(path: string): Data | undefined {
    this.reads += 1;
    return this.documents.get(path);
  }

  doc(path: string): DocumentWriterLike {
    return {
      set: (data, options) => {
        if (this.failingWrites > 0) {
          this.failingWrites -= 1;
          return Promise.reject(new Error("Firestore write failed"));
        }
        this.writes.push({kind: "set", path, data, ...(options === undefined ? {} : {mergeFields: options.mergeFields})});
        this.documents.set(path, options === undefined ? data : {...this.documents.get(path), ...data});
        return Promise.resolve();
      },
      delete: () => {
        this.writes.push({kind: "delete", path});
        this.documents.delete(path);
        return Promise.resolve();
      },
    };
  }

  collection(collectionPath: string): QueryLike {
    const parent = segmentsOf(collectionPath).join("/");
    return this.#query((path) => parentOf(path) === parent);
  }

  collectionGroup(collectionId: string): QueryLike {
    return this.#query((path) => idOf(parentOf(path)) === collectionId);
  }

  #query(select: Selector, after?: string, limit?: number): QueryLike {
    return {
      where: (field, _op, value) => this.#query((path, data) => select(path, data) && data[field] === value, after, limit),
      startAfter: (document) => this.#query(select, document.ref.path, limit),
      limit: (count) => this.#query(select, after, count),
      get: () => {
        const matching = [...this.documents].filter(([path, data]) => select(path, data));
        const start = after === undefined ? 0 : matching.findIndex(([path]) => path === after) + 1;
        const page = matching.slice(start, start + (limit ?? matching.length));
        this.reads += Math.max(1, page.length);
        return Promise.resolve({empty: page.length === 0, size: page.length, docs: page.map(([path, data]) => ({id: idOf(path), ref: {path}, data: () => data}))});
      },
    };
  }

  issueWrites(): RecordedWrite[] {
    return this.writes.filter(({path}) => path.startsWith("typesense_sync/issues/"));
  }
}

export interface WriteEvent {
  readonly before?: Data;
  readonly after?: Data;
  readonly latest?: Data | null;
}

export function writeEvent(store: FakeFirestore, path: string, {before, after, latest}: WriteEvent): DocumentChangeLike {
  const stored = latest === undefined ? after : (latest ?? undefined);
  if (stored === undefined) store.documents.delete(path);
  else store.documents.set(path, stored);

  const ref = {path, get: () => Promise.resolve({data: () => store.read(path)})};
  return {before: {data: () => before, ref}, after: {data: () => after, ref}};
}
