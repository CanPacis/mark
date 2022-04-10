import { useState, useEffect, useCallback } from "react";

interface Options {
  cache: string;
  hydrate: boolean;
  version: number;
  retry: number;
  params: { [key: string]: string };
  init: RequestInit;
}

class CacheManager {
  version = 1;
  key = "";

  setVersion(version: number) {
    this.version = version;
  }

  setKey(_key: string) {
    this.key = `${_key}-v${this.version}`;
  }

  async checkCache(request: Request): Promise<Response | null> {
    if (this.key.length > 0) {
      let cache = await caches.open(this.key);
      let response = await cache.match(request);

      if (response !== undefined) {
        return response;
      }

      return null;
    }
    return null;
  }

  async putCache(request: Request, response: Response): Promise<void> {
    if (this.key.length > 0) {
      let key = this.key;

      let cache = await caches.open(key);
      cache.put(request, response);
    }
  }
}

const manager = new CacheManager();

export function useFetch(uri: string, options: Partial<Options> = {}) {
  const { params = {}, init, cache, version = 1, hydrate = true } = options;
  manager.setVersion(version);
  if (cache) manager.setKey(cache);

  const controller = new AbortController();
  const signal = controller.signal;
  const query = new URLSearchParams(params).toString();
  const request = new Request(`${uri}?${query}`);
  const shouldCache = cache && (init?.method?.toUpperCase() || "GET") === "GET";
  let completed = false;
  let _hydrator: (response: Response) => void;

  let _hydrate = (hydrator: (response: Response) => void) => {
    _hydrator = hydrator;
  };

  let syncCache = async (cachedResponse: Response) => {
    let newResponse = await fetch(request, { ...init, signal });
    completed = true;
    let clone = newResponse.clone();
    let cachedText = await cachedResponse.text();
    let text = await clone.text();

    if (text !== cachedText && shouldCache) {
      manager.putCache(request, newResponse.clone());
      if (_hydrator) {
        _hydrator(newResponse);
      }
    }
  };

  let execute = async (): Promise<Response> => {
    let response;
    if (shouldCache) {
      let cachedResponse = await manager.checkCache(request);

      if (cachedResponse) {
        completed = true;
        if (hydrate) {
          syncCache(cachedResponse.clone());
        }
        return cachedResponse;
      }
    }

    response = await fetch(request, { ...init, signal });
    completed = true;

    if (shouldCache) {
      manager.putCache(request, response.clone());
    }
    return response;
  };

  const abort = () => {
    if (!completed) {
      controller.abort();
    }
  };

  return { execute, hydrate: _hydrate, abort };
}

export class Model<T> {
  fromJSON(raw: string): void {}
  toJSON(data: T): string {
    return JSON.stringify(data);
  }
}

interface JsonRequestOptions<T> extends Options {
  model: { new (): Model<T> };
}

export function useJsonRequest<T = any>(
  uri: string,
  options: Partial<JsonRequestOptions<T>> = {}
): {
  state: T | Model<T> | Model<T>[] | null;
  completed: boolean;
  hydrated: boolean;
  reexecute: () => void;
  abort: () => void;
  error: unknown | null;
} {
  const { execute, abort, hydrate } = useFetch(uri, options);
  const [state, setState] = useState<T | Model<T> | Model<T>[] | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [completed, setCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const _execute = useCallback(() => {
    try {
      execute()
        .then(async (response) => {
          if (response.status === 200) {
            let raw = await response.json();
            let data: T | Model<T> | Model<T>[];

            if (options.model) {
              if (raw instanceof Array) {
                let result: Model<T>[] = [];
                for (const entry of raw) {
                  let instance = new options.model();
                  instance.fromJSON(JSON.stringify(entry));
                  result.push(instance);
                }
                data = result;
              } else {
                data = new options.model();
                data.fromJSON(JSON.stringify(raw));
              }
            } else {
              data = raw as T;
            }

            return { data, error: false };
          }
          return { data: await response.json(), error: true };
        })
        .then(({ data, error }) => {
          if (!error) {
            setState(data);
          } else {
            setError(data);
          }
          setCompleted(true);
        });
    } catch (error) {
      setError(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute]);

  useEffect(() => {
    _execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  hydrate((response) =>
    response.json().then((data) => {
      setState(data);
      setHydrated(true);
    })
  );

  return { state, completed, hydrated, reexecute: _execute, abort, error };
}

interface BasicAuth {
  username: string;
  password: string;
}

interface BearerAuth {
  token: string;
}

type AuthMethod = BasicAuth | BearerAuth;
type P = "username" | "password" | "token";

function authMethod<T extends AuthMethod>(method: AuthMethod, member: P): method is T {
  // @ts-expect-error
  return method[member as K] !== undefined;
}

export function useAuthJsonRequest<T = any>(
  uri: string,
  options: Partial<JsonRequestOptions<T>> = {},
  credentials: AuthMethod
) {
  let headers: RequestInit["headers"] = {};

  if (authMethod<BasicAuth>(credentials, "username")) {
    headers["Authorization"] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  } else if (authMethod<BearerAuth>(credentials, "token")) {
    headers["Authorization"] = `Bearer ${credentials.token}`;
  }

  if (!("init" in options)) {
    options.init = { headers: {} };
  } else {
    if (!("headers" in options.init!)) {
      options.init!.headers = {};
    }
  }

  options.init!.headers = { ...options.init?.headers, ...headers };

  const {
    state,
    completed,
    hydrated,
    reexecute: _execute,
    abort,
    error,
  } = useJsonRequest<T>(uri, options);
  return { state, completed, hydrated, reexecute: _execute, abort, error };
}

export function useTextRequest(
  uri: string,
  options: Partial<Options> = {}
): {
  state: string | null;
  completed: boolean;
  hydrated: boolean;
  reexecute: () => void;
  abort: () => void;
  error: unknown | null;
} {
  const { execute, abort, hydrate } = useFetch(uri, options);
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [completed, setCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const _execute = useCallback(() => {
    try {
      execute()
        .then(async (response) => {
          if (response.status === 200) {
            return { data: await response.text(), error: false };
          }
          return { data: await response.text(), error: true };
        })
        .then(({ data, error }) => {
          if (!error) {
            setState(data);
          } else {
            setError(data);
          }
          setCompleted(true);
        });
    } catch (error) {
      setError(error);
    }
  }, [execute]);

  useEffect(() => {
    _execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  hydrate((response) =>
    response.text().then((data) => {
      setState(data);
      setHydrated(true);
    })
  );

  return { state, completed, hydrated, reexecute: _execute, abort, error };
}
