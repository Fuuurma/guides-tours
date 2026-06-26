import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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
	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					location.assign("/");
				},
			},
		});
	};

	return (
		<nav className="border-b bg-white">
			<div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
				<Link to="/dashboard" className="text-lg font-semibold">
					{orgName}
				</Link>
				<div className="flex flex-1 flex-wrap gap-1">
					{NAV_ITEMS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeOptions={item.exact ? { exact: true } : undefined}
							activeProps={{ className: "bg-gray-100 font-medium" }}
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