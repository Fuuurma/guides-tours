import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DetailSection } from "@/components/detail-page";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export { TourScheduleRulesSection } from "./tour-schedule-rules";

export function TourGallerySection({ tourId }: { tourId: Id<"tours"> }) {
	const { data: images, isPending } = useQuery(
		convexQuery(api.tourImages.list, { tourId }),
	);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const addImage = useMutation(api.tourImages.add);
	const updateImage = useMutation(api.tourImages.update);
	const removeImage = useMutation(api.tourImages.remove);
	const reorderImages = useMutation(api.tourImages.reorder);
	const fileRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [reorderPending, setReorderPending] = useState(false);

	const ordered = images ?? [];

	const moveImage = async (index: number, direction: -1 | 1) => {
		const next = index + direction;
		if (next < 0 || next >= ordered.length) return;
		const ids = ordered.map((img) => img._id);
		const current = ids[index];
		const swap = ids[next];
		if (current === undefined || swap === undefined) return;
		ids[index] = swap;
		ids[next] = current;
		setReorderPending(true);
		try {
			await reorderImages({ tourId, orderedImageIds: ids });
			toast.success("Gallery order updated");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setReorderPending(false);
		}
	};

	const onUpload = async (file: File) => {
		setUploading(true);
		try {
			const uploadUrl = await generateUploadUrl({});
			const res = await fetch(uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": file.type || "application/octet-stream" },
				body: file,
			});
			if (!res.ok) throw new Error(`Upload failed (${res.status})`);
			const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
			const isFirst = (images?.length ?? 0) === 0;
			await addImage({
				tourId,
				storageId,
				altText: file.name,
				isPrimary: isFirst,
				displayOrder: images?.length ?? 0,
				fileSize: file.size,
				format: file.type,
			});
			toast.success("Image uploaded");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setUploading(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	};

	return (
		<DetailSection
			title="Photos"
			description="Tour gallery images"
			actions={
				<>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) void onUpload(f);
						}}
					/>
					<Button
						type="button"
						size="sm"
						disabled={uploading}
						onClick={() => fileRef.current?.click()}
					>
						{uploading ? <Spinner data-icon="inline-start" /> : null}
						{uploading ? "Uploading…" : "Upload"}
					</Button>
				</>
			}
		>
			{isPending ? (
				<p className="text-muted-foreground text-sm">Loading…</p>
			) : (images?.length ?? 0) === 0 ? (
				<p className="text-muted-foreground text-sm">No photos yet.</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{ordered.map((img, index) => (
						<div
							key={img._id}
							className="flex flex-col gap-2 rounded-md border p-2"
						>
							{img.url ? (
								<img
									src={img.url}
									alt={img.altText || "Tour photo"}
									className="aspect-video w-full rounded object-cover"
								/>
							) : (
								<div className="aspect-video rounded bg-muted" />
							)}
							<div className="flex flex-wrap items-center gap-2">
								{img.isPrimary ? <Badge>Primary</Badge> : null}
								{img.isPrimary ? null : (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={async () => {
											try {
												await updateImage({
													imageId: img._id,
													isPrimary: true,
												});
												toast.success("Set as primary");
											} catch (err) {
												toast.error(getErrorMessage(err));
											}
										}}
									>
										Make primary
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={reorderPending || index === 0}
									onClick={() => void moveImage(index, -1)}
								>
									Up
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={reorderPending || index === ordered.length - 1}
									onClick={() => void moveImage(index, 1)}
								>
									Down
								</Button>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button type="button" size="sm" variant="destructive">
											Delete
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete photo?</AlertDialogTitle>
											<AlertDialogDescription>
												This permanently removes the image from storage.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												onClick={async () => {
													try {
														await removeImage({ imageId: img._id });
														toast.success("Photo deleted");
													} catch (err) {
														toast.error(getErrorMessage(err));
													}
												}}
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						</div>
					))}
				</div>
			)}
		</DetailSection>
	);
}
