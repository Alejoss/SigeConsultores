import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Lock, Eye, EyeOff, Copy, CheckCircle } from "lucide-react";

interface Manager {
  id: number;
  companyId: number;
  userId: number;
  managerEmail?: string;
  isActive?: boolean;
  createdAt: Date;
}

interface ManagerCredential {
  id: number;
  companyManagerId: number;
  email: string;
  isActive: boolean;
  lastPasswordChange?: Date;
  createdAt: Date;
}

interface ManagersCredentialsTableProps {
  managers: Manager[];
  credentials: ManagerCredential[];
}

export default function ManagersCredentialsTable({
  managers,
  credentials,
}: ManagersCredentialsTableProps) {
  const [showPasswords, setShowPasswords] = useState<{ [key: number]: boolean }>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const getCredentialForManager = (managerId: number) => {
    return credentials.find((c) => c.companyManagerId === managerId);
  };

  const togglePasswordVisibility = (managerId: number) => {
    setShowPasswords((prev) => ({
      ...prev,
      [managerId]: !prev[managerId],
    }));
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Gerentes - Credenciales de Acceso</CardTitle>
        <CardDescription>
          Lista de managers con sus credenciales de acceso a la plataforma
        </CardDescription>
      </CardHeader>

      <CardContent>
        {managers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No hay managers registrados aún</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última Actualización</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.map((manager) => {
                  const credential = getCredentialForManager(manager.id);
                  return (
                    <TableRow key={manager.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{manager.id}</TableCell>
                      <TableCell>
                        {credential ? (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-blue-600" />
                            <span>{credential.email}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Sin credenciales</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {credential && credential.isActive ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-green-700 font-medium">Activo</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Inactivo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {credential?.lastPasswordChange
                          ? new Date(credential.lastPasswordChange).toLocaleDateString("es-ES")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {credential && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(credential.email, credential.id)}
                              className="text-xs"
                            >
                              {copiedId === credential.id ? (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copiar Email
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Info Message */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          <p className="font-medium mb-2">Información de Acceso:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Los managers pueden acceder en: <code className="bg-white px-2 py-1 rounded">/login</code></li>
            <li>Necesitan su email y contraseña para ingresar</li>
            <li>Pueden recuperar su contraseña si la olvidan</li>
            <li>Comparte el link de login universal con los managers</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
