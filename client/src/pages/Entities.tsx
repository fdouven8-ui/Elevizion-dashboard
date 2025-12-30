import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, RefreshCw, Tv, Users, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { Entity } from "@shared/schema";

interface EntityFormData {
  entityType: "ADVERTISER" | "SCREEN";
  entityCode: string;
  displayName: string;
  company?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  phone?: string;
  email?: string;
  kvk?: string;
  btw?: string;
}

function EntityForm({ 
  entityType, 
  onSuccess 
}: { 
  entityType: "ADVERTISER" | "SCREEN"; 
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EntityFormData>();

  const createMutation = useMutation({
    mutationFn: async (data: EntityFormData) => {
      const response = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entityType: data.entityType,
          entityCode: data.entityCode,
          displayName: data.displayName,
          contactData: {
            company: data.company,
            address: data.address,
            zipcode: data.zipcode,
            city: data.city,
            phone: data.phone,
            email: data.email,
            kvk: data.kvk,
            btw: data.btw,
          },
          tags: [data.entityCode],
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Kon entiteit niet aanmaken");
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      toast.success(
        result.moneybirdContact?.created 
          ? `${entityType === "ADVERTISER" ? "Adverteerder" : "Scherm"} aangemaakt en Moneybird contact gecreëerd`
          : `${entityType === "ADVERTISER" ? "Adverteerder" : "Scherm"} aangemaakt`
      );
      onSuccess();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: EntityFormData) => {
    createMutation.mutate({ ...data, entityType });
  };

  const codePrefix = entityType === "ADVERTISER" ? "EVZ-ADV-" : "EVZ-";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entityCode">Code *</Label>
          <Input 
            id="entityCode"
            placeholder={`${codePrefix}0001`}
            {...register("entityCode", { required: "Code is verplicht" })}
            data-testid="input-entity-code"
          />
          {errors.entityCode && <p className="text-xs text-red-500">{errors.entityCode.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">Naam *</Label>
          <Input 
            id="displayName"
            placeholder={entityType === "ADVERTISER" ? "Bedrijfsnaam" : "Scherm naam"}
            {...register("displayName", { required: "Naam is verplicht" })}
            data-testid="input-display-name"
          />
          {errors.displayName && <p className="text-xs text-red-500">{errors.displayName.message}</p>}
        </div>
      </div>

      <div className="border-t pt-4 mt-4">
        <h4 className="text-sm font-medium mb-3">Moneybird Contactgegevens</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company">Bedrijf</Label>
            <Input 
              id="company"
              {...register("company")}
              data-testid="input-company"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email"
              type="email"
              {...register("email")}
              data-testid="input-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefoon</Label>
            <Input 
              id="phone"
              {...register("phone")}
              data-testid="input-phone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adres</Label>
            <Input 
              id="address"
              {...register("address")}
              data-testid="input-address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zipcode">Postcode</Label>
            <Input 
              id="zipcode"
              {...register("zipcode")}
              data-testid="input-zipcode"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Plaats</Label>
            <Input 
              id="city"
              {...register("city")}
              data-testid="input-city"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kvk">KVK</Label>
            <Input 
              id="kvk"
              {...register("kvk")}
              data-testid="input-kvk"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="btw">BTW-nummer</Label>
            <Input 
              id="btw"
              {...register("btw")}
              data-testid="input-btw"
            />
          </div>
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isSubmitting || createMutation.isPending}
        data-testid="button-submit-entity"
      >
        {createMutation.isPending ? "Aanmaken..." : `${entityType === "ADVERTISER" ? "Adverteerder" : "Scherm"} Aanmaken`}
      </Button>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ACTIVE":
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Actief
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
          <Clock className="h-3 w-3 mr-1" />
          In behandeling
        </Badge>
      );
    case "ERROR":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Fout
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function MoneybirdBadge({ contactId }: { contactId: string | null }) {
  if (contactId) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        <CheckCircle className="h-3 w-3 mr-1" />
        Gekoppeld
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-500">
      <AlertCircle className="h-3 w-3 mr-1" />
      Niet gekoppeld
    </Badge>
  );
}

function EntityTable({ 
  entities, 
  onRetrySync 
}: { 
  entities: Entity[];
  onRetrySync: (id: string) => void;
}) {
  const [, navigate] = useLocation();

  if (entities.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Geen entiteiten gevonden.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Naam</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Moneybird</TableHead>
          <TableHead>Yodeck</TableHead>
          <TableHead className="w-[100px]">Acties</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.map((entity) => (
          <TableRow 
            key={entity.id} 
            data-testid={`row-entity-${entity.id}`}
            className="cursor-pointer hover:bg-muted/50"
          >
            <TableCell className="font-mono text-sm">{entity.entityCode}</TableCell>
            <TableCell className="font-medium">{entity.displayName}</TableCell>
            <TableCell><StatusBadge status={entity.status} /></TableCell>
            <TableCell><MoneybirdBadge contactId={entity.moneybirdContactId} /></TableCell>
            <TableCell>
              {entity.yodeckDeviceId ? (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Gekoppeld
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-500">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Niet gekoppeld
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {(entity.status === "ERROR" || entity.status === "PENDING") && !entity.moneybirdContactId && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetrySync(entity.id);
                  }}
                  data-testid={`button-retry-${entity.id}`}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Entities() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"SCREEN" | "ADVERTISER">("SCREEN");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: entities = [], isLoading, error } = useQuery<Entity[]>({
    queryKey: ["entities"],
    queryFn: async () => {
      const response = await fetch("/api/entities", { credentials: "include" });
      if (!response.ok) throw new Error("Kon entiteiten niet laden");
      return response.json();
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (entityId: string) => {
      const response = await fetch(`/api/entities/${entityId}/retry-sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Sync retry mislukt");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      toast.success("Sync opnieuw geprobeerd");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const screenEntities = entities.filter(e => 
    e.entityType === "SCREEN" && 
    (e.entityCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
     e.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const advertiserEntities = entities.filter(e => 
    e.entityType === "ADVERTISER" && 
    (e.entityCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
     e.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const stats = {
    totalScreens: entities.filter(e => e.entityType === "SCREEN").length,
    activeScreens: entities.filter(e => e.entityType === "SCREEN" && e.status === "ACTIVE").length,
    totalAdvertisers: entities.filter(e => e.entityType === "ADVERTISER").length,
    activeAdvertisers: entities.filter(e => e.entityType === "ADVERTISER" && e.status === "ACTIVE").length,
    pendingSync: entities.filter(e => e.status === "PENDING" || e.status === "ERROR").length,
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">
            Entiteiten
          </h1>
          <p className="text-muted-foreground">
            Beheer schermen en adverteerders met automatische Moneybird integratie.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm" data-testid="button-add-entity">
              <Plus className="mr-2 h-4 w-4" /> 
              {activeTab === "SCREEN" ? "Scherm Toevoegen" : "Adverteerder Toevoegen"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {activeTab === "SCREEN" ? "Nieuw Scherm Toevoegen" : "Nieuwe Adverteerder Toevoegen"}
              </DialogTitle>
              <DialogDescription>
                Voer de gegevens in. Een Moneybird contact wordt automatisch aangemaakt.
              </DialogDescription>
            </DialogHeader>
            <EntityForm 
              entityType={activeTab} 
              onSuccess={() => setIsDialogOpen(false)} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4" data-testid="stat-screens">
          <div className="flex items-center gap-2">
            <Tv className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Schermen</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.activeScreens}/{stats.totalScreens}</p>
          <p className="text-xs text-muted-foreground">actief / totaal</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-advertisers">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Adverteerders</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.activeAdvertisers}/{stats.totalAdvertisers}</p>
          <p className="text-xs text-muted-foreground">actief / totaal</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-pending">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <span className="text-sm text-muted-foreground">Actie Nodig</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.pendingSync}</p>
          <p className="text-xs text-muted-foreground">sync problemen</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-total">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Totaal Actief</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.activeScreens + stats.activeAdvertisers}</p>
          <p className="text-xs text-muted-foreground">entiteiten met Moneybird</p>
        </div>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek op code of naam..." 
            className="pl-8" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "SCREEN" | "ADVERTISER")}>
        <TabsList>
          <TabsTrigger value="SCREEN" data-testid="tab-screens">
            <Tv className="h-4 w-4 mr-2" />
            Schermen ({screenEntities.length})
          </TabsTrigger>
          <TabsTrigger value="ADVERTISER" data-testid="tab-advertisers">
            <Users className="h-4 w-4 mr-2" />
            Adverteerders ({advertiserEntities.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="SCREEN" className="mt-4">
          <div className="rounded-md border bg-card">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Laden...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">Fout bij laden: {(error as Error).message}</div>
            ) : (
              <EntityTable 
                entities={screenEntities} 
                onRetrySync={(id) => retryMutation.mutate(id)}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="ADVERTISER" className="mt-4">
          <div className="rounded-md border bg-card">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Laden...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">Fout bij laden: {(error as Error).message}</div>
            ) : (
              <EntityTable 
                entities={advertiserEntities} 
                onRetrySync={(id) => retryMutation.mutate(id)}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
