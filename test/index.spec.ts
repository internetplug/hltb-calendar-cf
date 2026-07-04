import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/api/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function fetchWorker(path: string, init?: RequestInit) {
	const request = new IncomingRequest(`http://example.com${path}`, init);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe("API", () => {
	it("returns null user when not authenticated", async () => {
		const response = await fetchWorker("/api/auth/me");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: null });
	});

	it("rejects registration with a short password", async () => {
		const response = await fetchWorker("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "test@example.com", password: "short" }),
		});
		expect(response.status).toBe(400);
	});

	it("rejects registration with an invalid email", async () => {
		const response = await fetchWorker("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "not-an-email", password: "longenough123" }),
		});
		expect(response.status).toBe(400);
	});

	it("requires auth to save the calendar", async () => {
		const response = await fetchWorker("/api/calendar/save", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state: {} }),
		});
		expect(response.status).toBe(401);
	});

	it("requires auth to load the calendar", async () => {
		const response = await fetchWorker("/api/calendar/load");
		expect(response.status).toBe(401);
	});

	it("rejects non-HowLongToBeat URLs on /api/hltb/fetch", async () => {
		const response = await fetchWorker("/api/hltb/fetch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://attacker.com/howlongtobeat.com/game/123" }),
		});
		expect(response.status).toBe(400);
	});

	it("rejects short search queries", async () => {
		const response = await fetchWorker("/api/hltb/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: "a" }),
		});
		expect(response.status).toBe(400);
	});

	it("responds via SELF (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/api/auth/me");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: null });
	});
});
