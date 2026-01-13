import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Mail, Phone, MapPin, Send, CheckCircle, Loader2
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const contactSchema = z.object({
  name: z.string().min(2, "Naam is verplicht"),
  company: z.string().optional(),
  email: z.string().email("Voer een geldig e-mailadres in"),
  phone: z.string().optional(),
  message: z.string().min(10, "Bericht moet minimaal 10 tekens bevatten"),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const response = await fetch("/api/public/contact-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact",
          ...data,
        }),
      });
      if (!response.ok) {
        throw new Error("Verzenden mislukt");
      }
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
    },
  });

  const onSubmit = (data: ContactFormData) => {
    submitMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-slate-800">
              Neem contact op
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Vragen over adverteren of een scherm op je locatie? 
              Vul het formulier in en we nemen binnen 24 uur contact op.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="md:col-span-2">
              <Card className="border-2 border-slate-200">
                <CardHeader>
                  <CardTitle className="text-xl">Stuur een bericht</CardTitle>
                </CardHeader>
                <CardContent>
                  {submitted ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">
                        Bedankt voor je bericht!
                      </h3>
                      <p className="text-slate-600 mb-6">
                        We nemen zo snel mogelijk contact met je op, meestal binnen 24 uur.
                      </p>
                      <Button 
                        variant="outline" 
                        onClick={() => setSubmitted(false)}
                      >
                        Nog een bericht sturen
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Naam *</Label>
                          <Input
                            id="name"
                            placeholder="Je naam"
                            {...form.register("name")}
                            data-testid="input-contact-name"
                          />
                          {form.formState.errors.name && (
                            <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company">Bedrijfsnaam</Label>
                          <Input
                            id="company"
                            placeholder="Je bedrijf (optioneel)"
                            {...form.register("company")}
                            data-testid="input-contact-company"
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">E-mail *</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="je@email.nl"
                            {...form.register("email")}
                            data-testid="input-contact-email"
                          />
                          {form.formState.errors.email && (
                            <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Telefoon</Label>
                          <Input
                            id="phone"
                            placeholder="06-12345678 (optioneel)"
                            {...form.register("phone")}
                            data-testid="input-contact-phone"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="message">Bericht *</Label>
                        <Textarea
                          id="message"
                          placeholder="Waar kunnen we je mee helpen?"
                          rows={5}
                          {...form.register("message")}
                          data-testid="input-contact-message"
                        />
                        {form.formState.errors.message && (
                          <p className="text-sm text-red-500">{form.formState.errors.message.message}</p>
                        )}
                      </div>

                      <Button 
                        type="submit" 
                        size="lg"
                        className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700"
                        disabled={submitMutation.isPending}
                        data-testid="button-contact-submit"
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Verzenden...
                          </>
                        ) : (
                          <>
                            <Send className="h-5 w-5" />
                            Verstuur bericht
                          </>
                        )}
                      </Button>

                      {submitMutation.isError && (
                        <p className="text-sm text-red-500 mt-2">
                          Er ging iets mis. Probeer het opnieuw of stuur een e-mail.
                        </p>
                      )}
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-2 border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 mb-1">E-mail</h3>
                      <a 
                        href="mailto:info@elevizion.nl" 
                        className="text-emerald-600 hover:underline"
                      >
                        info@elevizion.nl
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 mb-1">Telefoon</h3>
                      <p className="text-slate-600 text-sm">
                        Bereikbaar op werkdagen
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 mb-1">Regio</h3>
                      <p className="text-slate-600 text-sm">
                        Actief in heel Limburg
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
                <h3 className="font-semibold text-slate-800 mb-2">
                  Reactietijd
                </h3>
                <p className="text-sm text-slate-600">
                  We reageren binnen 24 uur op werkdagen. 
                  Spoed? Vermeld dit in je bericht.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
