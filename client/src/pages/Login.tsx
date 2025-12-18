import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, LogIn } from "lucide-react";

interface User {
  id: string;
  username: string;
  role: string;
}

export default function Login() {
  const [, navigate] = useLocation();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/user", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
  });

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Monitor className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Elevizion Dashboard</CardTitle>
          <CardDescription>
            Log in om toegang te krijgen tot het beheersysteem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login"
          >
            <LogIn className="h-5 w-5 mr-2" />
            Inloggen met Replit
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Je wordt doorgestuurd naar Replit voor authenticatie
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
