/* eslint-disable */
/**
 * Server utilities for the betterAuth mock component used by the
 * public-booking httpAction test suite. Mirrors the shape of the
 * real `convex/betterAuth/_generated/server.ts` so the component's
 * `runQuery` syscall can resolve functions like `adapter/findOne`.
 *
 * TEST-ONLY. The production code path uses the real
 * `convex/betterAuth` component, not this file.
 */
import type {
	ActionBuilder,
	HttpActionBuilder,
	MutationBuilder,
	QueryBuilder,
	GenericActionCtx,
	GenericMutationCtx,
	GenericQueryCtx,
	GenericDatabaseReader,
	GenericDatabaseWriter,
} from "convex/server";
import {
	actionGeneric,
	httpActionGeneric,
	queryGeneric,
	mutationGeneric,
	internalActionGeneric,
	internalMutationGeneric,
	internalQueryGeneric,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const internalQuery: QueryBuilder<DataModel, "internal"> =
	internalQueryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> =
	internalMutationGeneric;
export const action: ActionBuilder<DataModel, "public"> = actionGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> =
	internalActionGeneric;
export const httpAction: HttpActionBuilder = httpActionGeneric;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
