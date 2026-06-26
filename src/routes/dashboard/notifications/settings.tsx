import { createFileRoute } from "@tanstack/react-router";
import { NotificationSettingsPage } from "../../../components/pages/notification-settings-page";

export const Route = createFileRoute("/dashboard/notifications/settings")({
	component: NotificationSettingsPage,
});
