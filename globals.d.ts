declare module 'universalify' {
  export function fromCallback<
    Arguments extends readonly unknown[],
    ErrorValue,
    ReturnValue
  >(
    fn: (
      ...arguments_: [
        ...Arguments,
        (error: ErrorValue, value: ReturnValue) => void
      ]
    ) => void
  ): {
    (...arguments_: Arguments): Promise<ReturnValue>;
    (
      ...arguments_: [
        ...Arguments,
        (error: ErrorValue, value: ReturnValue) => void
      ]
    ): void;
  };

  export function fromPromise<
    Arguments extends readonly unknown[],
    ReturnValue
  >(
    fn: (...arguments_: [...Arguments]) => Promise<ReturnValue>
  ): {
    (...arguments_: Arguments): Promise<ReturnValue>;
    (
      ...arguments_: [
        ...Arguments,
        (error: unknown, value: ReturnValue) => void
      ]
    ): void;
  };
}

declare module 'nice-cache' {
  class Cache {
    constructor(opt: { refreshInterval?: number; verbose?: boolean });

    get(type: string, key: string): any;
    set(type: string, key: string, data: unknown): void;
    sub(
      type: string,
      key: string,
      subscriber: (...args: unknown[]) => void
    ): void;
  }

  export = Cache;
}

declare module 'stringformat' {
  function format(...args: string[]): string;

  export = format;
}
