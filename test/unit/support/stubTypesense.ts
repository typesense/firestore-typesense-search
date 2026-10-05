import {createServer, type IncomingMessage, type Server} from "node:http";
import type {AddressInfo} from "node:net";

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

function defaultResponseBody(request: RecordedRequest, status: number): string {
  if (status === 404) return JSON.stringify({message: "Could not find a document with id: doc1"});
  if (request.url.includes("/documents/import")) {
    return request.body
      .split("\n")
      .filter((line) => line !== "")
      .map(() => JSON.stringify({success: true}))
      .join("\n");
  }
  return "{}";
}

export class StubTypesense {
  readonly requests: RecordedRequest[] = [];
  status = 200;
  readonly #server: Server = createServer((request: IncomingMessage, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const recorded = {method: request.method ?? "", url: request.url ?? "", body};
      this.requests.push(recorded);
      const contentType = recorded.url.includes("/documents/import") ? "text/plain" : "application/json";
      response.writeHead(this.status, {"Content-Type": contentType});
      response.end(defaultResponseBody(recorded, this.status));
    });
  });

  async start(): Promise<number> {
    await new Promise<void>((resolve) => {
      this.#server.listen(0, "127.0.0.1", resolve);
    });
    const address = this.#server.address();
    if (address === null || typeof address === "string") throw new Error("Stub server has no port");
    const {port}: AddressInfo = address;
    return port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
