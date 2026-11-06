import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";
import "./assessment-controls.css";

/** Public-page controls: no application layout, auth, storage or API dependencies. */
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { variant?: "default" | "ghost" }
>(function Button(
  { className = "", variant = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={`p-assessment-button p-assessment-button-${variant} ${className}`}
      {...props}
    />
  );
});

export function RadioGroup({
  className = "",
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={className}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className = "",
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={`p-assessment-radio ${className}`}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="p-assessment-radio-indicator">
        <CircleIcon size={8} fill="currentColor" aria-hidden="true" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
