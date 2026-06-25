import { describe, expect, it } from "vitest";
import { signSesRequest, buildSesSendEmailXml } from "../lib/awsSigV4";

describe("buildSesSendEmailXml", () => {
	it("escapes special characters", () => {
		const xml = buildSesSendEmailXml({
			from: "noreply@example.com",
			to: "user@example.com",
			subject: "Hello & <world>",
			bodyText: "Tom & Jerry <3",
		});
		expect(xml).toContain("Hello &amp; &lt;world&gt;");
		expect(xml).toContain("Tom &amp; Jerry &lt;3");
	});

	it("includes html body when provided", () => {
		const xml = buildSesSendEmailXml({
			from: "a@b.com",
			to: "c@d.com",
			subject: "subj",
			bodyText: "txt",
			bodyHtml: "<p>html</p>",
		});
		expect(xml).toContain("<Html>");
		expect(xml).toContain("&lt;p&gt;html&lt;/p&gt;");
	});
});

describe("signSesRequest", () => {
	const FIXED_DATE = new Date("2024-01-15T12:00:00.000Z");

	it("produces AWS SigV4 headers and signature", async () => {
		const signed = await signSesRequest({
			region: "us-east-1",
			accessKey: "AKIAIOSFODNN7EXAMPLE",
			secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			body: "<Action>SendEmail</Action>",
			now: FIXED_DATE,
		});

		expect(signed.method).toBe("POST");
		expect(signed.url).toBe("https://email.us-east-1.amazonaws.com/");
		expect(signed.headers.Host).toBe("email.us-east-1.amazonaws.com");
		expect(signed.headers["Content-Type"]).toBe("application/xml");
		expect(signed.headers["X-Amz-Date"]).toBe("20240115T120000Z");
		expect(signed.headers.Authorization).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20240115\/us-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[a-f0-9]{64}$/,
		);
	});

	it("accepts a custom endpoint", async () => {
		const signed = await signSesRequest({
			region: "eu-west-1",
			accessKey: "AKID",
			secretKey: "secret",
			body: "<x/>",
			endpoint: "email-fips.eu-west-1.amazonaws.com",
			now: FIXED_DATE,
		});
		expect(signed.headers.Host).toBe("email-fips.eu-west-1.amazonaws.com");
		expect(signed.headers.Authorization).toContain(
			"Credential=AKID/20240115/eu-west-1/ses/",
		);
	});

	it("produces deterministic signatures for same inputs", async () => {
		const a = await signSesRequest({
			region: "us-east-1",
			accessKey: "AKIA",
			secretKey: "secret",
			body: "<x/>",
			now: FIXED_DATE,
		});
		const b = await signSesRequest({
			region: "us-east-1",
			accessKey: "AKIA",
			secretKey: "secret",
			body: "<x/>",
			now: FIXED_DATE,
		});
		expect(a.headers.Authorization).toBe(b.headers.Authorization);
	});

	it("produces different signatures for different bodies", async () => {
		const a = await signSesRequest({
			region: "us-east-1",
			accessKey: "AKIA",
			secretKey: "secret",
			body: "<a/>",
			now: FIXED_DATE,
		});
		const b = await signSesRequest({
			region: "us-east-1",
			accessKey: "AKIA",
			secretKey: "secret",
			body: "<b/>",
			now: FIXED_DATE,
		});
		expect(a.headers.Authorization).not.toBe(b.headers.Authorization);
	});
});
