declare const brand: unique symbol;

export type Brand<Base, Name extends string> = Base & {readonly [brand]: Name};
