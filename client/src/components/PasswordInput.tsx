import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Controlled visibility; omit for independent toggle per field */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * Password input with show/hide toggle.
 *
 * Uses a single <input> and mutates its `type` attribute directly via a ref
 * (instead of changing it through React state) to avoid the "insertBefore"
 * DOM crash caused by browser extensions (LastPass, Bitwarden, etc.) that
 * inject sibling nodes next to the input element.
 */
export function PasswordInput({
  className,
  visible: visibleProp,
  onVisibleChange,
  disabled,
  ...props
}: PasswordInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalVisible, setInternalVisible] = useState(false);
  const isControlled = visibleProp !== undefined;
  const visible = isControlled ? visibleProp : internalVisible;

  const toggleVisible = () => {
    const next = !visible;
    // Mutate the DOM attribute directly — no React re-render of the input element
    if (inputRef.current) {
      inputRef.current.type = next ? "text" : "password";
    }
    onVisibleChange?.(next);
    if (!isControlled) {
      setInternalVisible(next);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="password"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
        onClick={toggleVisible}
        disabled={disabled}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
