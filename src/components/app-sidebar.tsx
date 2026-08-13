import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	BarChart3,
	Bell,
	Bus,
	CalendarDays,
	Car,
	ChevronsUpDown,
	FileText,
	FolderOpen,
	LayoutDashboard,
	LayoutGrid,
	type LucideIcon,
	MapPin,
	Menu,
	Receipt,
	ScrollText,
	Sparkles,
	UserSquare2,
	Users,
	WalletCards,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";

interface NavGroup {
	label: string;
	items: NavItem[];
}

interface NavItem {
	to: string;
	label: string;
	icon: LucideIcon;
	exact?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
	{
		label: "Run the week",
		items: [
			{ to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
			{ to: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
			{ to: "/dashboard/staffing", label: "Staffing", icon: Users },
			{ to: "/dashboard/assignments", label: "Assignments", icon: FileText },
			{ to: "/dashboard/schedules", label: "Schedules", icon: CalendarDays },
		],
	},
	{
		label: "Catalog",
		items: [
			{ to: "/dashboard/tours", label: "Tours", icon: MapPin },
			{ to: "/dashboard/templates", label: "Templates", icon: FileText },
			{ to: "/dashboard/categories", label: "Categories", icon: LayoutGrid },
		],
	},
	{
		label: "People & fleet",
		items: [
			{ to: "/dashboard/guides", label: "Guides", icon: UserSquare2 },
			{ to: "/dashboard/drivers", label: "Drivers", icon: Car },
			{ to: "/dashboard/vehicles", label: "Vehicles", icon: Bus },
			{ to: "/dashboard/vacations", label: "Vacations", icon: Sparkles },
		],
	},
	{
		label: "Bookings",
		items: [
			{ to: "/dashboard/bookings", label: "Bookings", icon: ScrollText },
			{ to: "/dashboard/customers", label: "Customers", icon: Users },
			{ to: "/dashboard/ota", label: "OTA Channels", icon: Receipt },
			{
				to: "/dashboard/settings/payments",
				label: "Payments",
				icon: WalletCards,
			},
		],
	},
	{
		label: "Workspace",
		items: [
			{ to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
			{
				to: "/dashboard/notifications",
				label: "Notifications",
				icon: Bell,
			},
			{ to: "/dashboard/files", label: "Files", icon: FolderOpen },
		],
	},
];

export function AppSidebar({
	orgName,
	userName,
	role,
	onSignOut,
}: {
	orgName: string;
	userName: string;
	role: string;
	onSignOut: () => void;
}) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const [switchingOrganization, setSwitchingOrganization] = useState(false);
	const { data: organizations } = useQuery(
		convexQuery(api.organizations.listMyOrganizations, {}),
	);
	const organizationList = organizations ?? [];

	const handleSwitchOrganization = async (organizationId: string) => {
		if (
			switchingOrganization ||
			organizationList.find(
				(organization) => organization.id === organizationId,
			)?.isActive
		) {
			return;
		}
		setSwitchingOrganization(true);
		try {
			const result = await authClient.organization.setActive({
				organizationId,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			window.location.assign("/dashboard");
		} catch {
			setSwitchingOrganization(false);
			toast.error("Could not switch organization. Please try again.");
		}
	};

	return (
		<>
			{/* Desktop sidebar */}
			<aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
				<SidebarContent
					orgName={orgName}
					userName={userName}
					role={role}
					onSignOut={onSignOut}
					organizations={organizationList}
					switchingOrganization={switchingOrganization}
					onSwitchOrganization={handleSwitchOrganization}
				/>
			</aside>

			{/* Mobile top bar */}
			<header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
				<Button
					variant="outline"
					size="icon"
					onClick={() => setMobileOpen(true)}
					aria-label="Open navigation"
					aria-expanded={mobileOpen}
				>
					<Menu />
				</Button>
				<div className="flex items-center gap-2">
					<span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
						<MapPin className="size-4" strokeWidth={2.5} />
					</span>
					<span className="text-sm font-semibold tracking-tight">
						{orgName}
					</span>
				</div>
			</header>

			<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
				<SheetContent
					side="left"
					className="w-72 gap-0 bg-sidebar p-0 sm:max-w-sm"
				>
					<SheetTitle className="sr-only">Main navigation</SheetTitle>
					<SidebarContent
						orgName={orgName}
						userName={userName}
						role={role}
						onSignOut={onSignOut}
						organizations={organizationList}
						switchingOrganization={switchingOrganization}
						onSwitchOrganization={handleSwitchOrganization}
						onNavigate={() => setMobileOpen(false)}
					/>
				</SheetContent>
			</Sheet>
		</>
	);
}

function SidebarContent({
	orgName,
	userName,
	role,
	onSignOut,
	organizations,
	switchingOrganization,
	onSwitchOrganization,
	onNavigate,
}: {
	orgName: string;
	userName: string;
	role: string;
	onSignOut: () => void;
	organizations: Array<{
		id: string;
		name: string;
		isActive: boolean;
	}>;
	switchingOrganization: boolean;
	onSwitchOrganization: (organizationId: string) => Promise<void>;
	onNavigate?: () => void;
}) {
	const { pathname } = useLocation();

	return (
		<div className="flex h-full flex-col">
			{/* Brand */}
			<div className="flex items-center gap-2.5 px-5 py-5">
				<span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
					<MapPin className="size-4" strokeWidth={2.5} />
				</span>
				{organizations.length > 1 ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								className="h-auto min-w-0 flex-1 justify-between px-2 py-1 text-left"
								disabled={switchingOrganization}
							>
								<span className="min-w-0">
									<span className="block truncate text-sm font-semibold tracking-tight">
										{orgName}
									</span>
									<span className="block text-[11px] font-normal text-muted-foreground">
										guides<span className="text-chart-1">.</span>tours
									</span>
								</span>
								<ChevronsUpDown />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-52">
							<DropdownMenuGroup>
								{organizations.map((organization) => (
									<DropdownMenuItem
										key={organization.id}
										disabled={organization.isActive}
										onSelect={() => void onSwitchOrganization(organization.id)}
									>
										<span className="truncate">{organization.name}</span>
										{organization.isActive ? (
											<span className="ml-auto text-xs text-muted-foreground">
												Active
											</span>
										) : null}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold tracking-tight">
							{orgName}
						</p>
						<p className="text-[11px] text-muted-foreground">
							guides<span className="text-chart-1">.</span>tours
						</p>
					</div>
				)}
			</div>

			{/* Nav */}
			<nav className="flex-1 overflow-y-auto px-3 pb-4">
				{NAV_GROUPS.map((group) => (
					<div key={group.label} className="mb-1">
						<p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
							{group.label}
						</p>
						{group.items.map((item) => (
							<SidebarLink
								key={item.to}
								item={item}
								pathname={pathname}
								onNavigate={onNavigate}
							/>
						))}
					</div>
				))}
			</nav>

			{/* User + sign out */}
			<div className="border-t px-3 py-3">
				<div className="flex items-center gap-2.5 px-2 py-1.5">
					<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
						{userName.charAt(0).toUpperCase()}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{userName}</p>
						<p className="text-[11px] text-muted-foreground capitalize">
							{role}
						</p>
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="mt-1 w-full justify-start text-muted-foreground"
					onClick={onSignOut}
				>
					Sign out
				</Button>
			</div>
		</div>
	);
}

function SidebarLink({
	item,
	pathname,
	onNavigate,
}: {
	item: NavItem;
	pathname: string;
	onNavigate?: () => void;
}) {
	const isActive = item.exact
		? pathname === item.to
		: pathname === item.to || pathname.startsWith(`${item.to}/`);

	return (
		<Link
			to={item.to}
			onClick={onNavigate}
			className={cn(
				"flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
				isActive
					? "bg-sidebar-primary/10 font-medium text-sidebar-primary"
					: "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
			)}
		>
			<item.icon
				className={cn(
					"size-4 shrink-0",
					isActive ? "text-sidebar-primary" : "text-muted-foreground/70",
				)}
			/>
			{item.label}
		</Link>
	);
}
