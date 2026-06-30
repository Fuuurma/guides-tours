import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

interface NavBarProps {
	orgName: string;
	userName: string;
	role: string;
}

interface NavItem {
	to: string;
	label: string;
	exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
	{ to: "/dashboard", label: "Home", exact: true },
	{ to: "/dashboard/tours", label: "Tours" },
	{ to: "/dashboard/templates", label: "Templates" },
	{ to: "/dashboard/categories", label: "Categories" },
	{ to: "/dashboard/schedules", label: "Schedules" },
	{ to: "/dashboard/bookings", label: "Bookings" },
	{ to: "/dashboard/customers", label: "Customers" },
	{ to: "/dashboard/analytics", label: "Analytics" },
	{ to: "/dashboard/assignments", label: "Assignments" },
	{ to: "/dashboard/vacations", label: "Vacations" },
	{ to: "/dashboard/vehicles", label: "Vehicles" },
	{ to: "/dashboard/drivers", label: "Drivers" },
	{ to: "/dashboard/ota", label: "OTA" },
	{ to: "/dashboard/notifications", label: "Notifications" },
	{ to: "/dashboard/settings/payments", label: "Payments" },
];

export function NavBar({ orgName, userName, role }: NavBarProps) {
	const orgs = useQuery(api.organizations.listMyOrganizations);
	const [switching, setSwitching] = useState(false);

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					location.assign("/");
				},
			},
		});
	};

	const handleSwitchOrg = async (orgId: string) => {
		setSwitching(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			// Reload to pick up the new active org across all queries.
			window.location.assign("/dashboard");
		} catch {
			setSwitching(false);
		}
	};

	const orgList = (orgs ?? []) as Array<{
		id: string;
		name: string;
		slug: string;
		logo: string | null;
		isActive: boolean;
	}>;

	return (
		<nav className="border-b bg-white">
			<div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
				{orgList.length > 1 ? (
					<Select
						value={orgList.find((o) => o.isActive)?.id ?? ""}
						onValueChange={(v) => void handleSwitchOrg(v)}
						disabled={switching}
					>
						<SelectTrigger className="w-auto gap-1 border-0 bg-transparent p-0 text-lg font-semibold shadow-none hover:bg-transparent">
							<SelectValue>{orgName}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{orgList.map((o) => (
								<SelectItem key={o.id} value={o.id}>
									{o.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<Link to="/dashboard" className="text-lg font-semibold">
						{orgName}
					</Link>
				)}
				<div className="flex flex-1 flex-wrap gap-1">
					{NAV_ITEMS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
							activeOptions={item.exact ? { exact: true } : undefined}
							activeProps={{ className: "bg-muted font-medium" }}
						>
							{item.label}
						</Link>
					))}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-sm">
						{userName} · {role}
					</span>
					<Button variant="outline" size="sm" onClick={handleSignOut}>
						Sign out
					</Button>
				</div>
			</div>
		</nav>
	);
}

export const NAV_ITEMS_EXPORT = NAV_ITEMS;
