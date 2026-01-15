import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, CheckCircle, AlertCircle, MapPin, Link2, RefreshCw, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Location } from "@shared/schema";

export default function Locations() {
  const { locations, addLocation } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Mutation for toggling readyForAds
  const toggleReadyMutation = useMutation({
    mutationFn: async ({ locationId, readyForAds }: { locationId: string; readyForAds: boolean }) => {
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ readyForAds }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Update failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Locatie bijgewerkt" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
      queryClient.invalidateQueries({ queryKey: ["active-regions"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const filteredLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (loc.address || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Locaties</h1>
          <p className="text-muted-foreground">Beheer partnerlocaties waar schermen zijn geïnstalleerd.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Locatie Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Locatie Toevoegen</DialogTitle>
            </DialogHeader>
            <LocationForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek locaties..." 
            className="pl-8" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Adres</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Advertenties</TableHead>
              <TableHead>Moneybird</TableHead>
              <TableHead>Contactpersoon</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.map((loc) => {
              const hasAddress = Boolean(loc.address && loc.address.trim());
              const hasCity = Boolean(loc.city && loc.city.trim());
              const hasZipcode = Boolean(loc.zipcode && loc.zipcode.trim());
              const addressComplete = hasAddress && hasCity && hasZipcode;
              
              return (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">
                    <Link href={`/locations/${loc.id}`} className="hover:underline">
                      {loc.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{loc.address || "-"}</span>
                      {(loc.zipcode || loc.city) && (
                        <span className="text-xs">{[loc.zipcode, loc.city].filter(Boolean).join(" ")}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge 
                        variant={loc.status === "active" ? "default" : "outline"}
                        className={loc.status === "active" ? "bg-green-500 text-white w-fit" : "text-muted-foreground w-fit"}
                      >
                        {loc.status === "active" ? "Actief" : 
                         loc.status === "paused" ? "Gepauzeerd" :
                         loc.status === "terminated" ? "Beëindigd" : "In behandeling"}
                      </Badge>
                      {!hasCity && (
                        <span className="text-xs text-orange-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Geen stad
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={(loc as any).readyForAds || false}
                              onCheckedChange={(checked) => {
                                toggleReadyMutation.mutate({ locationId: loc.id, readyForAds: checked });
                              }}
                              disabled={toggleReadyMutation.isPending}
                              data-testid={`switch-ready-${loc.id}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {(loc as any).readyForAds ? "Live" : "Uit"}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {!hasCity && !loc.regionCode ? 
                            "Vul eerst een stad in op de detailpagina" : 
                            (loc as any).readyForAds ? "Scherm is live voor advertenties" : "Klik om live te zetten"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    {loc.moneybirdContactId ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Gekoppeld
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Ontbreekt
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{loc.contactName || "-"}</span>
                      <span className="text-xs text-muted-foreground">{loc.email || ""}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acties</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/locations/${loc.id}`}>Details Bekijken</Link>
                        </DropdownMenuItem>
                        {!loc.moneybirdContactId && (
                          <DropdownMenuItem asChild>
                            <Link href={`/locations/${loc.id}`}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Koppel Moneybird contact
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredLocations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Geen locaties gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LocationForm({ onSuccess }: { onSuccess: () => void }) {
  const { addLocation } = useAppData();
  const { register, handleSubmit } = useForm<Omit<Location, "id" | "createdAt">>();

  const onSubmit = (data: any) => {
    addLocation({
      ...data,
      revenueSharePercent: Number(data.revenueSharePercent),
    });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Locatienaam</Label>
        <Input id="name" {...register("name", { required: true })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">Adres</Label>
        <Input id="address" {...register("address", { required: true })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="contactName">Contactpersoon</Label>
          <Input id="contactName" {...register("contactName", { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="share">Omzetdeling (%)</Label>
          <Input id="share" type="number" defaultValue={10} {...register("revenueSharePercent", { required: true })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register("email", { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefoon</Label>
          <Input id="phone" {...register("phone", { required: true })} />
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit">Locatie Aanmaken</Button>
      </div>
    </form>
  );
}
