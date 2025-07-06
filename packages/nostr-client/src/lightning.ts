import { NostrEvent } from "nostr-tools";
import { PixelEvent } from "./types";

export async function fetchLightningInvoice(pixelEvent: PixelEvent, zapRequest: NostrEvent) {
	const url = `https://zappy-place.pages.dev/.well-known/lnurlp/pay`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		if (data.callback) {
			const invoiceUrl = new URL(data.callback);
			invoiceUrl.searchParams.set('amount', (pixelEvent.amount * 1000).toString()); // Convert to millisats
			invoiceUrl.searchParams.set('nostr', JSON.stringify(zapRequest));

			const invoiceResponse = await fetch(invoiceUrl.toString());
			return await invoiceResponse.json();
		}
	} catch (error) {
		console.error('Failed to fetch from lightning address:', error);
	}
}