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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FormField } from "./form";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
		const tmp = ids[index]!;
		ids[index] = ids[next]!;
		ids[next] = tmp;
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
								<div className="aspect-video bg-muted rounded" />
							)}
							<div className="flex flex-wrap items-center gap-2">
								{img.isPrimary && <Badge>Primary</Badge>}
								{!img.isPrimary && (
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
									disabled={
										reorderPending || index === ordered.length - 1
									}
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

export function TourScheduleRulesSection({ tourId }: { tourId: Id<"tours"> }) {
	const { data: seasonals } = useQuery(
		convexQuery(api.tourSeasonalSchedules.list, { tourId }),
	);
	const { data: exceptions } = useQuery(
		convexQuery(api.tourExceptionDates.list, { tourId }),
	);
	const { data: blackouts } = useQuery(
		convexQuery(api.tourBlackoutDates.list, { tourId }),
	);

	const createSeasonal = useMutation(api.tourSeasonalSchedules.create);
	const removeSeasonal = useMutation(api.tourSeasonalSchedules.remove);
	const generate = useMutation(api.tourSeasonalSchedules.generate);
	const createException = useMutation(api.tourExceptionDates.create);
	const removeException = useMutation(api.tourExceptionDates.remove);
	const createBlackout = useMutation(api.tourBlackoutDates.create);
	const removeBlackout = useMutation(api.tourBlackoutDates.remove);

	const [genFrom, setGenFrom] = useState("");
	const [genTo, setGenTo] = useState("");
	const [genOpen, setGenOpen] = useState(false);
	const [genPending, setGenPending] = useState(false);

	return (
		<>
			<DetailSection
				title="Seasonal schedules"
				description="Recurring rules that generate concrete schedules"
				actions={
					<div className="flex gap-2">
						<Dialog open={genOpen} onOpenChange={setGenOpen}>
							<DialogTrigger asChild>
								<Button type="button" size="sm" variant="outline">
									Generate schedules
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Generate schedules</DialogTitle>
									<DialogDescription>
										Create concrete schedule rows from seasonal rules,
										exceptions, and blackouts.
									</DialogDescription>
								</DialogHeader>
								<div className="flex flex-col gap-3">
									<FormField label="From" htmlFor="gen-from">
										<Input
											id="gen-from"
											type="date"
											value={genFrom}
											onChange={(e) => setGenFrom(e.target.value)}
										/>
									</FormField>
									<FormField label="To" htmlFor="gen-to">
										<Input
											id="gen-to"
											type="date"
											value={genTo}
											onChange={(e) => setGenTo(e.target.value)}
										/>
									</FormField>
								</div>
								<DialogFooter>
									<Button
										type="button"
										disabled={genPending || !genFrom || !genTo}
										onClick={async () => {
											setGenPending(true);
											try {
												const result = await generate({
													tourId,
													dateFrom: genFrom,
													dateTo: genTo,
												});
												toast.success(
													`Created ${result.created}, skipped ${result.skipped}`,
												);
												setGenOpen(false);
											} catch (err) {
												toast.error(getErrorMessage(err));
											} finally {
												setGenPending(false);
											}
										}}
									>
										{genPending ? "Generating…" : "Generate"}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
						<SeasonalDialog
							tourId={tourId}
							onCreate={async (args) => {
								await createSeasonal(args);
								toast.success("Seasonal rule created");
							}}
						/>
					</div>
				}
			>
				{(seasonals?.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">No seasonal rules.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(seasonals ?? []).map((s) => (
							<li
								key={s._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">{s.name}</p>
									<p className="text-muted-foreground">
										{s.startDate} → {s.endDate} ·{" "}
										{s.daysOfWeek.map((d) => DOW_LABELS[d]).join(", ")}
										{s.startTime ? ` · ${s.startTime}` : ""}
										{s.capacityOverride ? ` · cap ${s.capacityOverride}` : ""}
									</p>
								</div>
								<div className="flex items-center gap-2">
									{!s.isActive && <Badge variant="secondary">Inactive</Badge>}
									<Button
										type="button"
										size="sm"
										variant="destructive"
										onClick={async () => {
											try {
												await removeSeasonal({ scheduleId: s._id });
												toast.success("Rule deleted");
											} catch (err) {
												toast.error(getErrorMessage(err));
											}
										}}
									>
										Delete
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection
				title="Exception dates"
				description="One-off added, removed, or modified dates"
				actions={
					<ExceptionDialog
						tourId={tourId}
						onCreate={async (args) => {
							await createException(args);
							toast.success("Exception created");
						}}
					/>
				}
			>
				{(exceptions?.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">No exceptions.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(exceptions ?? []).map((e) => (
							<li
								key={e._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">
										{e.date} ·{" "}
										<Badge variant="secondary">{e.exceptionType}</Badge>
									</p>
									<p className="text-muted-foreground">
										{[e.startTime, e.endTime].filter(Boolean).join("–") ||
											e.reason ||
											"—"}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									onClick={async () => {
										try {
											await removeException({ exceptionId: e._id });
											toast.success("Exception deleted");
										} catch (err) {
											toast.error(getErrorMessage(err));
										}
									}}
								>
									Delete
								</Button>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection
				title="Blackout dates"
				description="Date ranges when this tour cannot run"
				actions={
					<BlackoutDialog
						tourId={tourId}
						onCreate={async (args) => {
							await createBlackout(args);
							toast.success("Blackout created");
						}}
					/>
				}
			>
				{(blackouts?.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">No blackouts.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(blackouts ?? []).map((b) => (
							<li
								key={b._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">
										{b.startDate} → {b.endDate}
									</p>
									{b.reason && (
										<p className="text-muted-foreground">{b.reason}</p>
									)}
								</div>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									onClick={async () => {
										try {
											await removeBlackout({ blackoutId: b._id });
											toast.success("Blackout deleted");
										} catch (err) {
											toast.error(getErrorMessage(err));
										}
									}}
								>
									Delete
								</Button>
							</li>
						))}
					</ul>
				)}
			</DetailSection>
		</>
	);
}

function SeasonalDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		name: string;
		startDate: string;
		endDate: string;
		daysOfWeek: number[];
		startTime?: string;
		capacityOverride?: number;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [startTime, setStartTime] = useState("09:00");
	const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
	const [capacity, setCapacity] = useState("");
	const [pending, setPending] = useState(false);

	const toggleDay = (d: number) => {
		setDays((prev) =>
			prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Rule
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New seasonal rule</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<FormField label="Name *" htmlFor="s-name">
						<Input
							id="s-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</FormField>
					<div className="grid gap-3 md:grid-cols-2">
						<FormField label="Start *" htmlFor="s-start">
							<Input
								id="s-start"
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</FormField>
						<FormField label="End *" htmlFor="s-end">
							<Input
								id="s-end"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
						</FormField>
					</div>
					<FormField label="Start time" htmlFor="s-time">
						<Input
							id="s-time"
							type="time"
							value={startTime}
							onChange={(e) => setStartTime(e.target.value)}
						/>
					</FormField>
					<div className="flex flex-wrap gap-3">
						{DOW_LABELS.map((label, i) => (
							<label key={label} className="flex items-center gap-1.5 text-sm">
								<Checkbox
									checked={days.includes(i)}
									onCheckedChange={() => toggleDay(i)}
								/>
								{label}
							</label>
						))}
					</div>
					<FormField label="Capacity override" htmlFor="s-cap">
						<Input
							id="s-cap"
							type="number"
							min={1}
							value={capacity}
							onChange={(e) => setCapacity(e.target.value)}
							placeholder="Optional"
						/>
					</FormField>
				</div>
				<DialogFooter>
					<Button
						type="button"
						disabled={
							pending || !name || !startDate || !endDate || days.length === 0
						}
						onClick={async () => {
							setPending(true);
							try {
								await onCreate({
									tourId,
									name: name.trim(),
									startDate,
									endDate,
									daysOfWeek: days,
									startTime: startTime || undefined,
									capacityOverride: capacity
										? Number.parseInt(capacity, 10)
										: undefined,
								});
								setOpen(false);
								setName("");
							} catch (err) {
								toast.error(getErrorMessage(err));
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Saving…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ExceptionDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		date: string;
		exceptionType: "added" | "removed" | "modified";
		startTime?: string;
		endTime?: string;
		reason?: string;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [date, setDate] = useState("");
	const [type, setType] = useState<"added" | "removed" | "modified">("removed");
	const [startTime, setStartTime] = useState("09:00");
	const [endTime, setEndTime] = useState("11:00");
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Exception
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New exception</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<FormField label="Date *" htmlFor="e-date">
						<Input
							id="e-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</FormField>
					<FormField label="Type *" htmlFor="e-type">
						<Select
							value={type}
							onValueChange={(v) =>
								setType(v as "added" | "removed" | "modified")
							}
						>
							<SelectTrigger id="e-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="added">Added</SelectItem>
								<SelectItem value="removed">Removed</SelectItem>
								<SelectItem value="modified">Modified</SelectItem>
							</SelectContent>
						</Select>
					</FormField>
					{(type === "added" || type === "modified") && (
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Start time" htmlFor="e-start">
								<Input
									id="e-start"
									type="time"
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
								/>
							</FormField>
							<FormField label="End time" htmlFor="e-end">
								<Input
									id="e-end"
									type="time"
									value={endTime}
									onChange={(e) => setEndTime(e.target.value)}
								/>
							</FormField>
						</div>
					)}
					<FormField label="Reason" htmlFor="e-reason">
						<Input
							id="e-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</FormField>
				</div>
				<DialogFooter>
					<Button
						type="button"
						disabled={pending || !date}
						onClick={async () => {
							setPending(true);
							try {
								await onCreate({
									tourId,
									date,
									exceptionType: type,
									startTime:
										type === "removed" ? undefined : startTime || undefined,
									endTime:
										type === "removed" ? undefined : endTime || undefined,
									reason: reason.trim() || undefined,
								});
								setOpen(false);
							} catch (err) {
								toast.error(getErrorMessage(err));
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Saving…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function BlackoutDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		startDate: string;
		endDate: string;
		reason?: string;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Blackout
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New blackout</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="grid gap-3 md:grid-cols-2">
						<FormField label="Start *" htmlFor="b-start">
							<Input
								id="b-start"
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</FormField>
						<FormField label="End *" htmlFor="b-end">
							<Input
								id="b-end"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
						</FormField>
					</div>
					<FormField label="Reason" htmlFor="b-reason">
						<Input
							id="b-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</FormField>
				</div>
				<DialogFooter>
					<Button
						type="button"
						disabled={pending || !startDate || !endDate}
						onClick={async () => {
							setPending(true);
							try {
								await onCreate({
									tourId,
									startDate,
									endDate,
									reason: reason.trim() || undefined,
								});
								setOpen(false);
							} catch (err) {
								toast.error(getErrorMessage(err));
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Saving…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
