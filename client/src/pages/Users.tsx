import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users as UsersIcon, Shield, ShieldAlert, ShieldOff, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/models/auth";
import type { Location } from "@shared/schema";

const roleLabels: Record<string, string> = {
  admin: "Beheerder",
  finance: "Financieel",
  ops: "Operations",
  viewer: "Kijker",
  partner: "Partner",
};

const roleBadgeVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  admin: "destructive",
  finance: "default",
  ops: "default",
  viewer: "secondary",
  partner: "outline",
};

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, locationId }: { userId: string; role: string; locationId: string | null }) => {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role, locationId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Fout bij bijwerken rol");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Rol bijgewerkt", description: "De gebruikersrol is succesvol gewijzigd." });
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: string; activate: boolean }) => {
      const endpoint = activate ? "activate" : "deactivate";
      const response = await fetch(`/api/users/${userId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Fout bij wijzigen status");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Status bijgewerkt" });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setSelectedRole(user.role);
    setSelectedLocationId(user.locationId || "");
  };

  const handleSaveRole = () => {
    if (!editingUser) return;
    updateRoleMutation.mutate({
      userId: editingUser.id,
      role: selectedRole,
      locationId: selectedRole === "partner" ? selectedLocationId || null : null,
    });
  };

  const getUserInitials = (user: User) => {
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
  };

  const getUserDisplayName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "Onbekend";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-muted-foreground">Beheer gebruikersaccounts en rollen</p>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground" data-testid="text-access-denied">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Geen toegang</p>
              <p className="text-sm">Je hebt geen rechten om gebruikers te beheren. Alleen beheerders hebben toegang tot deze pagina.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Gebruikers</h1>
          <p className="text-muted-foreground">Beheer gebruikersaccounts en rollen</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            Alle Gebruikers ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nog geen gebruikers ingelogd
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Laatst Ingelogd</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName(user)} />
                          <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{getUserDisplayName(user)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariants[user.role] || "secondary"}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                      {user.role === "partner" && user.locationId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({locations.find(l => l.id === user.locationId)?.name || "Onbekend"})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "Actief" : "Inactief"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginAt 
                        ? new Date(user.lastLoginAt).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          data-testid={`button-edit-role-${user.id}`}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ userId: user.id, activate: false })}
                            data-testid={`button-deactivate-${user.id}`}
                          >
                            <ShieldOff className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ userId: user.id, activate: true })}
                            data-testid={`button-activate-${user.id}`}
                          >
                            <Shield className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rol Wijzigen</DialogTitle>
            <DialogDescription>
              Wijzig de rol voor {editingUser ? getUserDisplayName(editingUser) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rol</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="Selecteer rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Beheerder - Volledige toegang</SelectItem>
                  <SelectItem value="finance">Financieel - Facturen en betalingen</SelectItem>
                  <SelectItem value="ops">Operations - Schermen en locaties</SelectItem>
                  <SelectItem value="viewer">Kijker - Alleen lezen</SelectItem>
                  <SelectItem value="partner">Partner - Eigen locatie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedRole === "partner" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Locatie</label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="Selecteer locatie" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleSaveRole} 
              disabled={updateRoleMutation.isPending}
              data-testid="button-save-role"
            >
              {updateRoleMutation.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
