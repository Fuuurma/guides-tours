import { createFileRoute } from "@tanstack/react-router";
import { NewNotificationTemplatePage } from "../../../components/pages/new-notification-template-page";

export const Route = createFileRoute("/dashboard/notifications/new")({
	component: NewNotificationTemplatePage,
});
