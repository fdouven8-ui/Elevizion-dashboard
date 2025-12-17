import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal, Monitor } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import type { Screen } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Screens() {
  const { screens, locations, addScreen, updateScreen } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredScreens = screens.filter(scr => 
    scr.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'default';
      case 'offline': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Schermen</h1>
          <p className="text-muted-foreground">Monitor en beheer uw digital signage displays.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Scherm Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw Scherm Toevoegen</DialogTitle>
            </DialogHeader>
            <ScreenForm onSuccess={() => setIsDialogOpen(false)} locations={locations} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek schermen..." 
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
              <TableHead>Schermnaam</TableHead>
              <TableHead>Locatie</TableHead>
              <TableHead>Yodeck ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScreens.map((scr) => (
              <TableRow key={scr.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  {scr.name}
                </TableCell>
                <TableCell>{getLocationName(scr.locationId)}</TableCell>
                <TableCell className="font-mono text-xs">{scr.yodeckPlayerId || 'Niet Gekoppeld'}</TableCell>
                <TableCell>
                  <Badge variant={getStatusColor(scr.status) as any}>
                    {getStatusLabel(scr.status)}
                  </Badge>
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
                      <DropdownMenuItem onClick={() => updateScreen(scr.id, { status: 'online' })}>Markeer als Online</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateScreen(scr.id, { status: 'offline' })}>Markeer als Offline</DropdownMenuItem>
                      <DropdownMenuItem>Details Bewerken</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredScreens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Geen schermen gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScreenForm({ onSuccess, locations }: { onSuccess: () => void, locations: any[] }) {
  const { addScreen } = useAppData();
  const { register, handleSubmit, setValue } = useForm<any>();

  const onSubmit = (data: any) => {
    addScreen(data);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Schermnaam</Label>
        <Input id="name" {...register("name", { required: true })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="location">Locatie</Label>
        <Select onValueChange={(val) => setValue("locationId", val)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecteer locatie" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="yodeckId">Yodeck Player ID (Optioneel)</Label>
        <Input id="yodeckId" {...register("yodeckPlayerId")} />
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit">Scherm Aanmaken</Button>
      </div>
    </form>
  );
}
