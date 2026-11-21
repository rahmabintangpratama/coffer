import { useMemo } from "react";
import { looksBinary } from "@/lib/s3/keys";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { TEXT_LIMIT, useObjectBytes } from "./source";

export type TextContent =
  | { state: "loading" }
  | { state: "error" }
  /** Control characters: a binary file mislabelled as text (FR-54 edge case). */
  | { state: "binary" }
  | { state: "ready"; text: string; lines: number; gutter: string; truncated: boolean };

/**
 * The first 1 MiB of a file as text, for the code, Markdown and HTML views. Invalid
 * UTF-8 becomes replacement characters; a cut in the middle of a character loses
 * only that character.
 */
export function useTextContent(connection: ConnectionSummary, file: FileItem): TextContent {
  const bytes = useObjectBytes(connection, file, TEXT_LIMIT);
  const truncated = file.size > TEXT_LIMIT;
  return useMemo<TextContent>(() => {
    if (bytes.state !== "ready") return bytes;
    if (looksBinary(bytes.value)) return { state: "binary" };
    let text = new TextDecoder("utf-8").decode(bytes.value);
    if (truncated && text.endsWith("�")) text = text.slice(0, -1);
    const lines = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const gutter = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
    return { state: "ready", text, lines, gutter, truncated };
  }, [bytes, truncated]);
}
