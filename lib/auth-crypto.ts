import { createHash, randomBytes } from "crypto";
export function randomHex(byteLength: number): string {
    return randomBytes(byteLength).toString("hex");
}
export function sha256Hex(input: string): string {
    return createHash("sha256").update(input, "utf8").digest("hex");
}
