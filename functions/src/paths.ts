export type PathParams = Readonly<Record<string, string>>;

const PLACEHOLDER = /^{([^}]+)}$/;

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

export function parseFirestorePath(firestorePath: string | null | undefined): Readonly<Record<string, number>> {
  if (!firestorePath) {
    throw new Error("Invalid Firestore path: Path must be a non-empty string.");
  }

  const placeholders: Record<string, number> = {};
  segmentsOf(firestorePath).forEach((segment, index) => {
    const varName = PLACEHOLDER.exec(segment)?.[1];
    if (varName === undefined) return;
    if (Object.hasOwn(placeholders, varName)) {
      throw new Error(`Duplicate placeholder detected: ${varName}`);
    }
    placeholders[varName] = index;
  });
  return placeholders;
}

export function pathMatchesSelector(path: string | null | undefined, selector: string | null | undefined): PathParams | null {
  if (!path) {
    throw new Error("Invalid path: Path must be a non-empty string.");
  }
  if (!selector) {
    throw new Error("Invalid selector: Selector must be a non-empty string.");
  }

  const pathSegments = segmentsOf(path);
  const selectorSegments = segmentsOf(selector);
  if (pathSegments.length < selectorSegments.length) {
    return null;
  }

  const extracted: Record<string, string> = {};
  for (const [index, selectorSegment] of selectorSegments.entries()) {
    const pathSegment = pathSegments[index];
    if (pathSegment === undefined) return null;

    if (selectorSegment.startsWith("{") && selectorSegment.endsWith("}")) {
      extracted[selectorSegment.slice(1, -1)] = pathSegment;
    } else if (selectorSegment !== pathSegment) {
      return null;
    }
  }
  return extracted;
}
