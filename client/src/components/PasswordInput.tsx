import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Controlled visibility; omit for independent toggle per field */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

export function PasswordInput({
  className,
  visible: visibleProp,
  onVisibleChange,
  disabled,
  ...props
}: PasswordInputProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const isControlled = visibleProp !== undefined;
  const visible = isControlled ? visibleProp : internalVisible;

  const toggleVisible = () => {
    const next = !visible;
    onVisibleChange?.(next);
    if (!isControlled) {
      setInternalVisible(next);
    }
  };

  // Use two separate inputs (one password, one text) toggled via CSS
  // to avoid the insertBefore DOM crash caused by changing input type at runtime
  return (
    <div className="relative">
      <Input
        type="password"
        className={cn("pr-10", className, visible ? "hidden" : "")}
        disabled={disabled}
        {...props}
      />
      <Input
        type="text"
        className={cn("pr-10", className, visible ? "" : "hidden")}
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
