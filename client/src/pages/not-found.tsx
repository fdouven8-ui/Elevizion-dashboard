import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-white">
      <div className="text-center px-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">404</h1>
        <h2 className="text-xl font-semibold text-slate-700 mb-4">Pagina Niet Gevonden</h2>
        <p className="text-slate-600 mb-8 max-w-md">
          De pagina die u zoekt bestaat niet of is verplaatst. Ga terug naar de homepage om verder te gaan.
        </p>
        <a href="/">
          <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Home className="h-5 w-5" />
            Naar Homepage
          </Button>
        </a>
      </div>
    </div>
  );
}
