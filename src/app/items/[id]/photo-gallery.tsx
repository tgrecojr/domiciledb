"use client";

import { X } from "lucide-react";
import { useState } from "react";

interface Photo {
	id: number;
	web: string;
	original: string;
}

export function PhotoGallery({ photos }: { photos: Photo[] }) {
	const [open, setOpen] = useState<Photo | null>(null);

	return (
		<>
			{photos.map((p) => (
				<button
					key={p.id}
					type="button"
					onClick={() => setOpen(p)}
					aria-label="View larger"
					className="h-20 w-20 overflow-hidden rounded-lg"
				>
					<img
						src={p.web}
						alt=""
						className="h-full w-full object-cover transition hover:opacity-90"
					/>
				</button>
			))}

			{open ? (
				<div
					className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
					// Close only on backdrop clicks; the image and link stay inert
					// without needing their own stopPropagation handlers.
					onClick={(e) => {
						if (e.target === e.currentTarget) setOpen(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Escape") setOpen(null);
					}}
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						onClick={() => setOpen(null)}
						aria-label="Close"
						className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white"
					>
						<X className="h-5 w-5" />
					</button>
					<img
						src={open.web}
						alt=""
						className="max-h-[85vh] max-w-full rounded-lg object-contain"
					/>
					<a
						href={open.original}
						target="_blank"
						rel="noreferrer"
						className="mt-3 text-sm text-white/80 underline"
					>
						View original
					</a>
				</div>
			) : null}
		</>
	);
}
