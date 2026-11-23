import type { ChangeEvent, KeyboardEvent } from "react";

function integerDigits(value: string): string | null {
  const digits = value.trim().replace(/,/g, "");
  return /^\d+$/.test(digits) ? digits : null;
}

/** An empty optional minimum and an explicit zero both mean unrestricted. */
export function parseIntegerMinimum(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  const digits = integerDigits(text);
  if (digits === null) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : null;
}

function formatInteger(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Store digits without display commas. Keep invalid drafts visible for correction. */
export function groupedIntegerInputProps(value: string, onChange: (value: string) => void) {
  const digits = integerDigits(value);
  return {
    type: "text",
    inputMode: "numeric" as const,
    value: digits === null ? value : formatInteger(digits),
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const input = event.currentTarget;
      const start = input.selectionStart;
      if (start === null || start !== input.selectionEnd) return;
      if (event.key === "Backspace" && input.value[start - 1] === ",") input.setSelectionRange(start - 1, start - 1);
      if (event.key === "Delete" && input.value[start] === ",") input.setSelectionRange(start + 1, start + 1);
    },
    onChange(event: ChangeEvent<HTMLInputElement>) {
      const input = event.currentTarget;
      const text = input.value;
      const raw = integerDigits(text);
      if (raw === null) {
        onChange(text);
        return;
      }
      const formatted = formatInteger(raw);
      let remaining = text.slice(0, input.selectionStart ?? text.length).replace(/\D/g, "").length;
      let cursor = 0;
      while (remaining > 0 && cursor < formatted.length) {
        if (formatted[cursor] !== ",") remaining--;
        cursor++;
      }
      input.value = formatted;
      input.setSelectionRange(cursor, cursor);
      onChange(raw);
    },
  };
}
