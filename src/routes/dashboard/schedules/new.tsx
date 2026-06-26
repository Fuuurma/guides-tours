import { createFileRoute } from "@tanstack/react-router";
import { NewSchedulePage } from "../../../components/pages/new-schedule-page";

export const Route = createFileRoute("/dashboard/schedules/new")({
	component: NewSchedulePage,
});
