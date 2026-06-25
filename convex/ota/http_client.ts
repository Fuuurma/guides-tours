// Generic HTTP client for OTA providers.
//
// Wraps fetch with timeouts + JSON parsing + a single header-builder
// callback. Each provider gives us a `getHeaders()` function that
// returns the auth headers for that provider; this client adds them
// to every request.
//
// Uses the global fetch + AbortController — both available in the
// Convex default runtime and Node 18+. No node-specific imports
// needed.

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface HttpRequest {
	method: HttpMethod;
	path: string; // appended to baseUrl
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined>;
}

export interface HttpClientOptions {
	baseUrl: string;
	getHeaders: () => Promise<Record<string, string>> | Record<string, string>;
	timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
	status: number;
	body: T;
}

export class HttpError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: unknown,
	) {
		super(message);
		this.name = "HttpError";
	}
}

export class OTAHttpClient {
	private readonly baseUrl: string;
	private readonly getHeaders: () =>
		| Promise<Record<string, string>>
		| Record<string, string>;
	private readonly timeoutMs: number;

	constructor(opts: HttpClientOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/$/, "");
		this.getHeaders = opts.getHeaders;
		this.timeoutMs = opts.timeoutMs ?? 30_000;
	}

	async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
		const url = this.buildUrl(req.path, req.query);
		const headers = await this.getHeaders();
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			this.timeoutMs,
		);
		try {
			const response = await fetch(url, {
				method: req.method,
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
				signal: controller.signal,
			});
			const text = await response.text();
			const body = text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
			if (!response.ok) {
				throw new HttpError(
					`OTA ${req.method} ${url} failed: ${response.status} ${response.statusText}`,
					response.status,
					body,
				);
			}
			return { status: response.status, body };
		} finally {
			clearTimeout(timeout);
		}
	}

	async get<T = unknown>(
		path: string,
		query?: HttpRequest["query"],
	): Promise<HttpResponse<T>> {
		return this.request<T>({ method: "GET", path, query });
	}

	async post<T = unknown>(
		path: string,
		body?: unknown,
	): Promise<HttpResponse<T>> {
		return this.request<T>({ method: "POST", path, body });
	}

	async put<T = unknown>(
		path: string,
		body?: unknown,
	): Promise<HttpResponse<T>> {
		return this.request<T>({ method: "PUT", path, body });
	}

	async delete<T = unknown>(path: string): Promise<HttpResponse<T>> {
		return this.request<T>({ method: "DELETE", path });
	}

	private buildUrl(
		path: string,
		query?: Record<string, string | number | boolean | undefined>,
	): string {
		const url = new URL(
			path.startsWith("/") ? path : `/${path}`,
			this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`,
		);
		if (query) {
			for (const [k, v] of Object.entries(query)) {
				if (v !== undefined) url.searchParams.set(k, String(v));
			}
		}
		return url.toString();
	}
}
