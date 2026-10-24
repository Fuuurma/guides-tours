import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexProvider } from "convex/react";
import { guardOneTimeTokenInWindow } from "./lib/oauth-initiator";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const convexUrl = import.meta.env.VITE_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("VITE_CONVEX_URL is not set");
	}

	// Browser-bind the OAuth one-time token BEFORE the router parses the
	// URL: ConvexBetterAuthProvider exchanges any `ott` it finds at mount
	// and the /auth/callback loader exchanges its search param, so this is
	// the one point ahead of both. A token this browser did not initiate
	// is stripped here and never reaches either (see lib/oauth-initiator).
	if (typeof window !== "undefined") guardOneTimeTokenInWindow();

	// This app has both protected dashboard queries and anonymous booking
	// pages. Leaving the socket paused until auth is confirmed would make a
	// fresh unauthenticated public page wait forever because no auth provider
	// callback runs to resume it.
	const convexQueryClient = new ConvexQueryClient(convexUrl);

	const queryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				queryKeyHashFn: convexQueryClient.hashFn(),
				queryFn: convexQueryClient.queryFn(),
			},
		},
	});
	convexQueryClient.connect(queryClient);

	const router = createTanStackRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
		scrollRestoration: true,
		context: { queryClient, convexQueryClient },
		Wrap: ({ children }) => (
			<ConvexProvider client={convexQueryClient.convexClient}>
				{children}
			</ConvexProvider>
		),
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
