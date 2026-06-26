import { createFileRoute } from "@tanstack/react-router";
import { NewTourPage } from "../../../components/pages/new-tour-page";

export const Route = createFileRoute("/dashboard/tours/new")({
	component: NewTourPage,
});