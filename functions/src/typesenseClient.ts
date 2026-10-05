import {Client} from "typesense";

export type ConfigurationOptions = ConstructorParameters<typeof Client>[0];

function getRandomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createTypesenseClient(config: ConfigurationOptions): Client {
  return new Client({
    ...config,
    connectionTimeoutSeconds: getRandomInteger(60, 90),
    retryIntervalSeconds: getRandomInteger(60, 120),
  });
}
