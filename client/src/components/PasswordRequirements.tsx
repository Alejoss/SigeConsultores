import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARS } from "@/lib/password";

interface PasswordRequirementsProps {
  minLength?: number;
  className?: string;
}

export function PasswordRequirements({
  minLength = PASSWORD_MIN_LENGTH,
  className = "",
}: PasswordRequirementsProps) {
  return (
    <div
      className={`bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800 ${className}`}
    >
      <p className="font-medium mb-1">Requisitos de contraseña:</p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li>Al menos {minLength} caracteres</li>
        <li>Una letra mayúscula (A-Z)</li>
        <li>Una letra minúscula (a-z)</li>
        <li>Un número (0-9)</li>
        <li>
          Un carácter especial ({PASSWORD_SPECIAL_CHARS.split("").join(" ")})
        </li>
      </ul>
    </div>
  );
}
