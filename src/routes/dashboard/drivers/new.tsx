import { createFileRoute } from "@tanstack/react-router";
import { NewDriverPage } from "../../../components/pages/new-driver-page";

export const Route = createFileRoute("/dashboard/drivers/new")({
	component: NewDriverPage,
});
