import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal, Calendar } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function Campaigns() {
  const { campaigns, advertisers, addCampaign } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredCampaigns = campaigns.filter(cmp => 
    cmp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAdvertiserName = (id: string) => advertisers.find(a => a.id === id)?.companyName || "Unknown";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Campaigns</h1>
          <p className="text-muted-foreground">Manage advertising campaigns and screen assignments.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Create Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
            </DialogHeader>
            <CampaignForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search campaigns..." 
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
              <TableHead>Campaign Name</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCampaigns.map((cmp) => (
              <TableRow key={cmp.id}>
                <TableCell className="font-medium">{cmp.name}</TableCell>
                <TableCell>{getAdvertiserName(cmp.advertiserId)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {cmp.startDate} <span className="mx-1">→</span> {cmp.endDate}
                </TableCell>
                <TableCell>
                  <Badge variant={cmp.status === 'active' ? 'default' : 'outline'}>
                    {cmp.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {filteredCampaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No campaigns found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CampaignForm({ onSuccess }: { onSuccess: () => void }) {
  const { addCampaign, advertisers, screens } = useAppData();
  const { register, handleSubmit, setValue } = useForm<any>();
  const [selectedScreens, setSelectedScreens] = useState<string[]>([]);

  const toggleScreen = (id: string) => {
    setSelectedScreens(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const onSubmit = (data: any) => {
    addCampaign({
      ...data,
      status: "active"
    }, { screenIds: selectedScreens });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input id="name" {...register("name", { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="advertiser">Advertiser</Label>
          <Select onValueChange={(val) => setValue("advertiserId", val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select advertiser" />
            </SelectTrigger>
            <SelectContent>
              {advertisers.map((adv) => (
                <SelectItem key={adv.id} value={adv.id}>
                  {adv.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input id="startDate" type="date" {...register("startDate", { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input id="endDate" type="date" {...register("endDate", { required: true })} />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Assign to Screens</Label>
        <div className="grid grid-cols-2 gap-2 border rounded-md p-4 h-48 overflow-y-auto">
          {screens.map(screen => (
            <div key={screen.id} className="flex items-center space-x-2">
              <Checkbox 
                id={screen.id} 
                checked={selectedScreens.includes(screen.id)}
                onCheckedChange={() => toggleScreen(screen.id)}
              />
              <Label htmlFor={screen.id} className="cursor-pointer">{screen.name}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Launch Campaign</Button>
      </div>
    </form>
  );
}
