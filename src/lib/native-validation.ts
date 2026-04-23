import type React from "react";

type SupportedFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface NativeValidationOptions {
  label: string;
  customValidationMessage?: (value: string) => string | null;
  minLengthMessage?: string;
  maxLengthMessage?: string;
  invalidTypeMessage?: string;
  patternMessage?: string;
  requiredMessage?: string;
}

export function createNativeValidationProps(options: NativeValidationOptions) {
  return {
    onInvalid: (event: React.InvalidEvent<SupportedFieldElement>) => {
      const target = event.currentTarget;
      const { validity } = target;

      if (validity.valueMissing) {
        target.setCustomValidity(options.requiredMessage ?? `请输入${options.label}。`);
        return;
      }

      if (validity.typeMismatch) {
        if (target.type === "email") {
          target.setCustomValidity(options.invalidTypeMessage ?? "请输入有效的邮箱地址。");
          return;
        }

        target.setCustomValidity(options.invalidTypeMessage ?? `请输入有效的${options.label}。`);
        return;
      }

      const customValidationMessage = options.customValidationMessage?.(target.value);
      if (customValidationMessage) {
        target.setCustomValidity(customValidationMessage);
        return;
      }

      if (validity.tooShort) {
        target.setCustomValidity(options.minLengthMessage ?? `请检查${options.label}长度。`);
        return;
      }

      if (validity.tooLong) {
        target.setCustomValidity(options.maxLengthMessage ?? `请检查${options.label}长度。`);
        return;
      }

      if (validity.patternMismatch) {
        target.setCustomValidity(options.patternMessage ?? `请检查${options.label}格式。`);
        return;
      }

      target.setCustomValidity(`请检查${options.label}。`);
    },
    onInput: (event: React.FormEvent<SupportedFieldElement>) => {
      event.currentTarget.setCustomValidity("");
    },
  };
}