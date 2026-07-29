import { useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
	const googleEnabled = useQuery(api.auth.isGoogleEnabled, {});
	const [pending, setPending] = useState(false);

	if (googleEnabled !== true) return null;

	async function onClick() {
		setPending(true);
		try {
			const result = await authClient.signIn.social({
				callbackURL,
				provider: "google",
			});
			if (result.error) {
				toast.error(result.error.message ?? "Google sign-in failed");
				setPending(false);
			}
			// On success, the browser redirects to callbackURL — pending
			// stays true so the button remains disabled during redirect.
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Google sign-in failed",
			);
			setPending(false);
		}
	}

	return (
		<Button
			type="button"
			variant="outline"
			className="w-full"
			onClick={onClick}
			disabled={pending}
		>
			{pending ? "Connecting..." : "Continue with Google"}
		</Button>
	);
}
