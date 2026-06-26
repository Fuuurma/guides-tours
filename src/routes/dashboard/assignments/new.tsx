import { createFileRoute } from "@tanstack/react-router";
import { NewAssignmentPage } from "../../../components/pages/new-assignment-page";

export const Route = createFileRoute("/dashboard/assignments/new")({
	component: NewAssignmentPage,
});
