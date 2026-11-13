interface Equatable {
  isEqual(other: unknown): boolean;
}

type FirestoreMap = Readonly<Record<string, unknown>>;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isMap(value: unknown): value is FirestoreMap {
  return typeof value === "object" && value !== null;
}

function isEquatable(value: object): value is Equatable {
  return "isEqual" in value && typeof value.isEqual === "function";
}

function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function bytesEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
  const left = bytesOf(a);
  const right = bytesOf(b);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => firestoreValuesEqual(item, b[index]));
}

function mapsEqual(a: FirestoreMap, b: FirestoreMap): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && firestoreValuesEqual(a[key], b[key]));
}

function sameKind(a: object, b: object): boolean {
  const left: unknown = Object.getPrototypeOf(a);
  const right: unknown = Object.getPrototypeOf(b);
  return left === right;
}

export function firestoreValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (isUnknownArray(a) || isUnknownArray(b)) return isUnknownArray(a) && isUnknownArray(b) && arraysEqual(a, b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && bytesEqual(a, b);
  if (!isMap(a) || !isMap(b) || !sameKind(a, b)) return false;
  if (isEquatable(a)) return a.isEqual(b);
  return mapsEqual(a, b);
}
