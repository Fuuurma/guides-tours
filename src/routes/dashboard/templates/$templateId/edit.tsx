import { createFileRoute } from "@tanstack/react-router";
import { EditTemplatePage } from "../../../../components/pages/edit-template-page";

export const Route = createFileRoute("/dashboard/templates/$templateId/edit")({
	component: EditTemplateRoute,
});

function EditTemplateRoute() {
	const { templateId } = Route.useParams();
	return <EditTemplatePage templateId={templateId} />;
}
