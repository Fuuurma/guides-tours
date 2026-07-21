import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";

export type OrgMemberRow = {
	userId: string;
	name: string;
	email: string;
	role: string;
	image: string | null;
	phone: string;
};

/**
 * Shared org-member roster query. Prefer this over calling
 * `api.organizations.listMembers` ad hoc so loading/error and name
 * maps stay consistent across calendar, assignments, guides, etc.
 */
export function useOrgMembers(roles?: string[]) {
	const query = useQuery(
		convexQuery(api.organizations.listMembers, {
			roles: roles && roles.length > 0 ? roles : undefined,
		}),
	);

	const members = (query.data ?? []) as OrgMemberRow[];
	const nameById = useMemo(
		() => new Map(members.map((m) => [m.userId, m.name])),
		[members],
	);

	const displayName = (userId: string) => nameById.get(userId) ?? userId;

	return {
		members,
		nameById,
		displayName,
		isPending: query.isPending,
		error: query.error,
		refetch: query.refetch,
	};
}
