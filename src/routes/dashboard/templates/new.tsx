import { createFileRoute } from "@tanstack/react-router";
import { NewTemplatePage } from "../../../components/pages/new-template-page";

export const Route = createFileRoute("/dashboard/templates/new")({
	component: NewTemplatePage,
});
