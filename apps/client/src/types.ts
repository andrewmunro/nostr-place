import { NostrEvent } from "nostr-tools";

export interface WindowNostr {
	getPublicKey(): Promise<string>;
	signEvent(event: NostrEvent): Promise<NostrEvent>;
	getRelays?: () => Promise<Record<string, { read: boolean; write: boolean }>>;
	nip04?: {
		encrypt(pubkey: string, plaintext: string): Promise<string>;
		decrypt(pubkey: string, ciphertext: string): Promise<string>;
	};
}

declare global {
	interface Window {
		nostr?: WindowNostr;
		webln?: {
			enable(): Promise<void>;
			getInfo(): Promise<any>;
			sendPayment(invoice: string): Promise<any>;
		};
	}
}

export { };
