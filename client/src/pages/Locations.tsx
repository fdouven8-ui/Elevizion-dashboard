import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal } from "lucide-react";
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
import type { Location } from "@shared/schema";

export default function Locations() {
  const { locations, addLocation } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchTerm.toLowerCase())
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
              <TableHead>Contactpersoon</TableHead>
              <TableHead className="text-right">Omzetdeling %</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.map((loc) => (
              <TableRow key={loc.id}>
                <TableCell className="font-medium">{loc.name}</TableCell>
                <TableCell className="text-muted-foreground">{loc.address}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{loc.contactName}</span>
                    <span className="text-xs text-muted-foreground">{loc.email}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{loc.revenueSharePercent}%</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acties</DropdownMenuLabel>
                      <DropdownMenuItem>Details Bekijken</DropdownMenuItem>
                      <DropdownMenuItem>Instellingen Bewerken</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredLocations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
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
