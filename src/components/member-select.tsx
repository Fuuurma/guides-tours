import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../convex/_generated/api";

const NONE_VALUE = "__none__";

export interface MemberSelectProps {
	value: string;
	onValueChange: (userId: string) => void;
	/** When set, only members with these roles are shown. */
	roles?: string[];
	placeholder?: string;
	id?: string;
	disabled?: boolean;
	/** Allow clearing the selection (emits ""). */
	allowNone?: boolean;
	noneLabel?: string;
	className?: string;
}

/**
 * shadcn Select over organizations.listMembers.
 * Value is the Better Auth user ID string.
 */
export function MemberSelect({
	value,
	onValueChange,
	roles,
	placeholder = "Select a member…",
	id,
	disabled,
	allowNone = false,
	noneLabel = "None",
	className,
}: MemberSelectProps) {
	const { data: members, isPending } = useQuery(
		convexQuery(api.organizations.listMembers, {
			roles: roles && roles.length > 0 ? roles : undefined,
		}),
	);

	const items = members ?? [];

	return (
		<Select
			value={value || (allowNone ? NONE_VALUE : undefined)}
			onValueChange={(v) => onValueChange(v === NONE_VALUE ? "" : v)}
			disabled={disabled || isPending}
		>
			<SelectTrigger id={id} className={className}>
				<SelectValue placeholder={isPending ? "Loading…" : placeholder} />
			</SelectTrigger>
			<SelectContent>
				{allowNone && <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>}
				{items.map((m) => (
					<SelectItem key={m.userId} value={m.userId}>
						{m.name}
						{m.role ? ` (${m.role})` : ""}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** Resolve a display name without leaking Better Auth IDs into operator UI. */
export function memberDisplayName(
	members: Array<{ userId: string; name: string }> | undefined,
	userId: string,
): string {
	const hit = members?.find((m) => m.userId === userId);
	return hit?.name ?? "Former member";
}
