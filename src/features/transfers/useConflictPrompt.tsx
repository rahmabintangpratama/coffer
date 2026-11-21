import { useCallback, useRef, useState } from "react";
import { ConflictDialog } from "./ConflictDialog";
import type { ConflictAnswer, ConflictQuestion } from "./resolve";

/**
 * A promise-shaped conflict dialog: `ask` shows "This file already exists" and resolves with the
 * person's choice. Uploads and the move, rename and copy dialogs share it (FR-43 semantics, AC-32.3).
 */
export function useConflictPrompt(folderName: string) {
  const [question, setQuestion] = useState<ConflictQuestion | null>(null);
  const waiting = useRef<((answer: ConflictAnswer) => void) | null>(null);
  const ask = useCallback(
    (next: ConflictQuestion) =>
      new Promise<ConflictAnswer>((resolve) => {
        waiting.current = resolve;
        setQuestion(next);
      }),
    [],
  );
  const answer = useCallback((value: ConflictAnswer) => {
    setQuestion(null);
    waiting.current?.(value);
    waiting.current = null;
  }, []);
  const dialog = <ConflictDialog question={question} folder={folderName} onAnswer={answer} />;
  return { ask, dialog };
}
