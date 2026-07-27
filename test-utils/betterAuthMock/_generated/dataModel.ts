/* eslint-disable */
/**
 * Data model for the betterAuth mock component. The shape mirrors the
 * real component's `organization` table so the mock's `findOne` can
 * return rows with the same `{ id, name, slug }` shape that
 * `convex/public_booking.ts` casts to.
 *
 * TEST-ONLY.
 */
import type {
	DataModelFromSchemaDefinition,
	DocumentByName,
	TableNamesInDataModel,
	SystemTableNames,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<
	DataModel,
	TableName
>;
export type Id<TableName extends TableNames | SystemTableNames> =
	GenericId<TableName>;
