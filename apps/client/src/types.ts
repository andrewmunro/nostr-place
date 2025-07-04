// Type definitions for window.nostr
export interface NostrEvent {
	id?: string;
	kind: number;
	pubkey?: string;
	created_at: number;
	tags: string[][];
	content: string;
	sig?: string;
}

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
	}
}

export { };
