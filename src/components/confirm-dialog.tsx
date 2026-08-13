import { AlertTriangle, Trash2 } from "lucide-react";
import type * as React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Accessible, styled replacement for `window.confirm`.
//
// Wrap the app in <ConfirmProvider> and call `const ok = await confirm(opts)`
// anywhere — the dialog renders with the design system and returns a
// Promise<boolean>. Drop-in compatible with the old `window.confirm` flow
// (same boolean semantics) but non-blocking and theme-consistent.

type ConfirmVariant = "default" | "destructive";

type ConfirmOptions = {
	title: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
	variant?: ConfirmVariant;
};

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;
type PendingConfirmation = {
	options: ConfirmOptions;
	resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
	const activeRef = useRef<PendingConfirmation | null>(null);
	const queueRef = useRef<PendingConfirmation[]>([]);
	const closingRef = useRef(false);
	const nextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
		return new Promise<boolean>((resolve) => {
			const request = { options: opts, resolve };
			if (activeRef.current || closingRef.current) {
				queueRef.current.push(request);
				return;
			}
			activeRef.current = request;
			setOptions(opts);
			setOpen(true);
		});
	}, []);

	const handleClose = useCallback((result: boolean) => {
		const active = activeRef.current;
		if (!active) return;

		activeRef.current = null;
		active.resolve(result);
		closingRef.current = true;
		setOpen(false);

		const next = queueRef.current.shift();
		nextTimeoutRef.current = setTimeout(() => {
			nextTimeoutRef.current = null;
			closingRef.current = false;
			if (!next) return;
			activeRef.current = next;
			setOptions(next.options);
			setOpen(true);
		}, 0);
	}, []);

	useEffect(() => {
		return () => {
			if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
			activeRef.current?.resolve(false);
			for (const pending of queueRef.current) pending.resolve(false);
		};
	}, []);

	const isDestructive = options.variant === "destructive";

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			<AlertDialog open={open} onOpenChange={(v) => !v && handleClose(false)}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						{isDestructive && (
							<div className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
								<AlertTriangle className="size-6" />
							</div>
						)}
						<AlertDialogTitle>{options.title}</AlertDialogTitle>
						{options.description && (
							<AlertDialogDescription>
								{options.description}
							</AlertDialogDescription>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => handleClose(false)}>
							{options.cancelText ?? "Cancel"}
						</AlertDialogCancel>
						<AlertDialogAction
							variant={isDestructive ? "destructive" : "default"}
							onClick={() => handleClose(true)}
						>
							{isDestructive && <Trash2 />}
							{options.confirmText ?? (isDestructive ? "Delete" : "Confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ConfirmContext.Provider>
	);
}

export function useConfirm(): ConfirmContextValue {
	const ctx = useContext(ConfirmContext);
	if (!ctx) {
		throw new Error("useConfirm must be used within <ConfirmProvider>");
	}
	return ctx;
}

// Re-exported so call sites that just need the button-label variant can
// use the component directly without a full dialog.
export { Button as ConfirmButton };
