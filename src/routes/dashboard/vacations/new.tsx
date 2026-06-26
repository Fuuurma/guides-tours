import { createFileRoute } from "@tanstack/react-router";
import { NewVacationPage } from "../../../components/pages/new-vacation-page";

export const Route = createFileRoute("/dashboard/vacations/new")({
	component: NewVacationPage,
});
